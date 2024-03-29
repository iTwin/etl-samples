/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/* eslint-disable id-blacklist */

import { Id64, Id64String } from "@itwin/core-bentley";
import {
  ECClass, NavigationProperty, PrimitiveProperty, PrimitiveType, Property, PropertyTypeUtils, RelationshipClass, Schema, SchemaItem, SchemaItemType,
  StrengthDirection,
} from "@itwin/ecschema-metadata";
import {
  Element, ElementMultiAspect, ElementUniqueAspect, Entity, IModelJsFs as fs, IModelDb, IModelSchemaLoader, Model, Relationship,
} from "@itwin/core-backend";
import { IModelExporter, IModelExportHandler } from "@itwin/core-transformer";
import { CodeSpec, RelatedElement } from "@itwin/core-common";

// disable shadowing errors for enum names
/* eslint-disable @typescript-eslint/no-shadow */

/** Enumeration of RDF types.
 * @see https://www.w3.org/TR/rdf11-concepts/
 */
enum Rdf {
  prefix = "rdf",
  iri = "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  type = "rdf:type",
  Property = "rdf:Property",
  List = "rdf:List",
}

/** Enumeration of RDF Schema (RDFS) types.
 * @see https://www.w3.org/TR/rdf-schema/
 */
enum Rdfs {
  prefix = "rdfs",
  iri = "http://www.w3.org/2000/01/rdf-schema#",
  Class = "rdfs:Class",
  subClassOf = "rdfs:subClassOf",
  Literal = "rdfs:Literal",
  label = "rdfs:label",
  comment = "rdfs:comment",
  range = "rdfs:range",
  domain = "rdfs:domain",
}

/** Enumeration of RDF-compatible XSD types.
 * @see https://www.w3.org/TR/rdf11-concepts/#dfn-rdf-compatible-xsd-types
 */
enum Xsd {
  prefix = "xsd",
  iri = "http://www.w3.org/2001/XMLSchema#",
  base64Binary = "xsd:base64Binary",
  boolean = "xsd:boolean",
  dateTime = "xsd:dateTime",
  double = "xsd:double",
  integer = "xsd:integer",
  long = "xsd:long",
  string = "xsd:string",
}

/** Enumeration of RDF-compatible ECSchema types.
 * @note These names have not been finalized.
 * @beta
 */
enum Ec {
  prefix = "ec",
  iri = "http://www.example.org/ec#",
  Class = "ec:Class",
  EntityClass = "ec:EntityClass",
  RelationshipClass = "ec:RelationshipClass",
  CustomAttributeClass = "ec:CustomAttributeClass",
  Enumeration = "ec:Enumeration",
  IGeometry = "ec:IGeometry",
  Mixin = "ec:Mixin",
  Property = "ec:Property",
  PrimitiveProperty = "ec:PrimitiveProperty",
  StructProperty = "ec:StructProperty",
  PrimitiveArrayProperty = "ec:PrimitiveArrayProperty",
  StructArrayProperty = "ec:StructArrayProperty",
  NavigationProperty = "ec:NavigationProperty",
  Point2d = "ec:Point2d",
  Point3d = "ec:Point3d",
  ExtendedType = "ec:ExtendedType",
  Id64String = "ec:Id64String",
  JsonString = "ec:JsonString",
  GuidString = "ec:GuidString",
}

enum InstancePrefix {
  CodeSpec = "codeSpecId",
  Element = "elementId",
  ElementAspect = "aspectId",
  Model = "modelId",
  Relationship = "relationshipId",
}

/* eslint-enable @typescript-eslint/no-shadow */

/** Exports iModel data to the Terse RDF Triple Language file format.
 * @see https://en.wikipedia.org/wiki/Turtle_(syntax)
 */
export class TurtleExporter extends IModelExportHandler {
  public sourceDb: IModelDb;
  public targetFileName: string;
  public schemaLoader: IModelSchemaLoader;
  public iModelExporter: IModelExporter;
  constructor(sourceDb: IModelDb, targetFileName: string) {
    super();
    if (fs.existsSync(targetFileName)) {
      fs.removeSync(targetFileName);
    }
    this.sourceDb = sourceDb;
    this.targetFileName = targetFileName;
    this.schemaLoader = new IModelSchemaLoader(sourceDb);
    this.iModelExporter = new IModelExporter(sourceDb);
    this.iModelExporter.registerHandler(this);
    this.iModelExporter.wantGeometry = false;
  }
  /** Initiate the export */
  public static async export(iModelDb: IModelDb, outputFileName: string): Promise<void> {
    const handler = new TurtleExporter(iModelDb, outputFileName);
    handler.writeRdfPrefix();
    handler.writeRdfsPrefix();
    handler.writeXsdPrefix();
    handler.writeEcTypes();
    await handler.iModelExporter.exportSchemas();
    handler.writeInstancePrefixes();
    await handler.iModelExporter.exportAll();
  }
  /** Override of IModelExportHandler.onExportSchema */
  public override async onExportSchema(schema: Schema): Promise<void> {
    this.writeSchema(schema);
    await super.onExportSchema(schema);
  }
  /** Override of IModelExportHandler.onExportCodeSpec */
  public override onExportCodeSpec(codeSpec: CodeSpec, isUpdate: boolean | undefined): void {
    const codeSpecClassRdfName = this.formatSchemaItemFullName("BisCore:CodeSpec");
    const codeSpecInstanceRdfName = this.formatCodeSpecInstanceId(codeSpec.id);
    this.writeTriple(codeSpecInstanceRdfName, Rdf.type, codeSpecClassRdfName);
    this.writeTriple(codeSpecInstanceRdfName, `${codeSpecClassRdfName}-Name`, JSON.stringify(codeSpec.name)); // use JSON.stringify to add surrounding quotes and escape special characters
    super.onExportCodeSpec(codeSpec, isUpdate);
  }
  /** Override of IModelExportHandler.onExportElement */
  public override onExportElement(element: Element, isUpdate: boolean | undefined): void {
    const elementClass: ECClass = this.tryGetECClass(element.classFullName)!;
    const elementClassRdfName = this.formatSchemaItemFullName(element.classFullName);
    const elementInstanceRdfName = this.formatElementInstanceId(element.id);
    this.writeTriple(elementInstanceRdfName, Rdf.type, elementClassRdfName);
    if (element.code.value !== "") { // handle custom mapping of Code between TypeScript and ECSchema
      const elementBaseClassRdfName = this.formatSchemaItemFullName(Element.classFullName);
      this.writeTriple(elementInstanceRdfName, `${elementBaseClassRdfName}-CodeSpec`, this.formatCodeSpecInstanceId(element.code.spec));
      this.writeTriple(elementInstanceRdfName, `${elementBaseClassRdfName}-CodeScope`, this.formatElementInstanceId(element.code.scope));
      this.writeTriple(elementInstanceRdfName, `${elementBaseClassRdfName}-CodeValue`, JSON.stringify(element.code.value)); // use JSON.stringify to add surrounding quotes and escape special characters
    }
    this.writeEntityInstanceProperties(element, elementClass, elementInstanceRdfName);
    super.onExportElement(element, isUpdate);
  }
  /** Override of IModelExportHandler.onExportElementUniqueAspect */
  public override onExportElementUniqueAspect(aspect: ElementUniqueAspect, isUpdate: boolean | undefined): void {
    const aspectClass: ECClass = this.tryGetECClass(aspect.classFullName)!;
    const aspectClassRdfName = this.formatSchemaItemFullName(aspect.classFullName);
    const aspectInstanceRdfName = this.formatAspectInstanceId(aspect.id);
    this.writeTriple(aspectInstanceRdfName, Rdf.type, aspectClassRdfName);
    this.writeEntityInstanceProperties(aspect, aspectClass, aspectInstanceRdfName);
    super.onExportElementUniqueAspect(aspect, isUpdate);
  }
  /** Override of IModelExportHandler.onExportElementMultiAspects */
  public override onExportElementMultiAspects(aspects: ElementMultiAspect[]): void {
    for (const aspect of aspects) {
      const aspectClass: ECClass = this.tryGetECClass(aspect.classFullName)!;
      const aspectClassRdfName = this.formatSchemaItemFullName(aspect.classFullName);
      const aspectInstanceRdfName = this.formatAspectInstanceId(aspect.id);
      this.writeTriple(aspectInstanceRdfName, Rdf.type, aspectClassRdfName);
      this.writeEntityInstanceProperties(aspect, aspectClass, aspectInstanceRdfName);
    }
    super.onExportElementMultiAspects(aspects);
  }
  /** Override of IModelExportHandler.onExportModel */
  public override onExportModel(model: Model, isUpdate: boolean | undefined): void {
    const modelClass: ECClass = this.tryGetECClass(model.classFullName)!;
    const modelClassRdfName = this.formatSchemaItemFullName(model.classFullName);
    const modelInstanceRdfName = this.formatModelInstanceId(model.id);
    this.writeTriple(modelInstanceRdfName, Rdf.type, modelClassRdfName);
    this.writeEntityInstanceProperties(model, modelClass, modelInstanceRdfName);
    super.onExportModel(model, isUpdate);
  }
  /** Override of IModelExportHandler.onExportRelationship */
  public override onExportRelationship(relationship: Relationship, isUpdate: boolean | undefined): void {
    const relationshipClass: ECClass = this.tryGetECClass(relationship.classFullName)!;
    const relationshipClassRdfName = this.formatSchemaItemFullName(relationship.classFullName);
    const relationshipInstanceRdfName = this.formatRelationshipInstanceId(relationship.id);
    this.writeTriple(relationshipInstanceRdfName, Rdf.type, relationshipClassRdfName);
    this.writeTriple(relationshipInstanceRdfName, `${Ec.RelationshipClass}-Source`, this.formatElementInstanceId(relationship.sourceId));
    this.writeTriple(relationshipInstanceRdfName, `${Ec.RelationshipClass}-Target`, this.formatElementInstanceId(relationship.targetId));
    this.writeEntityInstanceProperties(relationship, relationshipClass, relationshipInstanceRdfName);
    super.onExportRelationship(relationship, isUpdate);
  }
  public writeTriple(subject: string, predicate: string, object: any): void {
    fs.appendFileSync(this.targetFileName, `${subject} ${predicate} ${object} .\n`);
  }
  public writePrefix(prefix: string, iri: string): void {
    this.writeTriple("@prefix", `${prefix}:`, `<${iri}>`);
  }
  private writeRdfPrefix(): void {
    this.writePrefix(Rdf.prefix, Rdf.iri);
  }
  private writeRdfsPrefix(): void {
    this.writePrefix(Rdfs.prefix, Rdfs.iri);
  }
  private writeXsdPrefix(): void {
    this.writePrefix(Xsd.prefix, Xsd.iri);
  }
  public writeInstancePrefixes(): void {
    const basePrefix = `http://www.example.org/iModel/${this.sourceDb.iModelId}/`;
    this.writePrefix(InstancePrefix.CodeSpec, `${basePrefix}codeSpec#`);
    this.writePrefix(InstancePrefix.ElementAspect, `${basePrefix}aspect#`);
    this.writePrefix(InstancePrefix.Element, `${basePrefix}element#`);
    this.writePrefix(InstancePrefix.Model, `${basePrefix}model#`);
    this.writePrefix(InstancePrefix.Relationship, `${basePrefix}relationship#`);
  }
  private writeEcTypes(): void {
    this.writePrefix(Ec.prefix, Ec.iri);
    // rdfs:Class types
    this.writeTriple(Ec.Class, Rdfs.subClassOf, Rdfs.Class);
    this.writeTriple(Ec.EntityClass, Rdfs.subClassOf, Ec.Class);
    this.writeTriple(Ec.RelationshipClass, Rdfs.subClassOf, Ec.Class);
    this.writeTriple(Ec.CustomAttributeClass, Rdfs.subClassOf, Ec.Class);
    this.writeTriple(Ec.Mixin, Rdfs.subClassOf, Ec.Class);
    this.writeTriple(Ec.Enumeration, Rdfs.subClassOf, Rdfs.Class);
    // rdf.Property types
    this.writePropertyTriples(Ec.EntityClass, "Id", Ec.PrimitiveProperty, Ec.Id64String, "Id of the entity instance");
    this.writePropertyTriples(Ec.RelationshipClass, "Id", Ec.PrimitiveProperty, Ec.Id64String, "Id of the relationship instance");
    this.writePropertyTriples(Ec.RelationshipClass, "Source", Ec.NavigationProperty, Ec.EntityClass, "The source of the relationship");
    this.writePropertyTriples(Ec.RelationshipClass, "Target", Ec.NavigationProperty, Ec.EntityClass, "The target of the relationship");
    this.writeTriple(Ec.Property, Rdfs.subClassOf, Rdf.Property);
    this.writeTriple(Ec.PrimitiveProperty, Rdfs.subClassOf, Ec.Property);
    this.writeTriple(Ec.PrimitiveArrayProperty, Rdfs.subClassOf, Ec.Property);
    this.writeTriple(Ec.StructProperty, Rdfs.subClassOf, Ec.Property);
    this.writeTriple(Ec.StructArrayProperty, Rdfs.subClassOf, Ec.Property);
    this.writeTriple(Ec.NavigationProperty, Rdfs.subClassOf, Ec.Property);
    // primitive types
    this.writeTriple(Ec.GuidString, Rdfs.subClassOf, Xsd.string);
    this.writeTriple(Ec.Id64String, Rdfs.subClassOf, Xsd.string);
    this.writeTriple(Ec.JsonString, Rdfs.subClassOf, Xsd.string);
    this.writeTriple(Ec.Point2d, Rdfs.subClassOf, Ec.JsonString);
    this.writeTriple(Ec.Point3d, Rdfs.subClassOf, Ec.JsonString);
    // write consistent labels for each "ec" enum member
    Object.keys(Ec).forEach((key) => this.writeLabel(`ec:${key}`));
  }
  public writeLabel(rdfName: string, label: string = rdfName): void {
    this.writeTriple(rdfName, Rdfs.label, JSON.stringify(label)); // use JSON.stringify to add surrounding quotes and escape special characters
  }
  public writeComment(rdfName: string, comment: string): void {
    this.writeTriple(rdfName, Rdfs.comment, JSON.stringify(comment)); // use JSON.stringify to add surrounding quotes and escape special characters
  }
  public writeSchema(schema: Schema): void {
    this.writePrefix(schema.alias, `http://www.example.org/schemas/${schema.schemaKey}#`);
    for (const item of schema.getItems()) {
      if (item instanceof ECClass) {
        this.writeClass(item);
      } else if (SchemaItemType.Enumeration === item.schemaItemType) {
        const enumerationRdfName = this.formatSchemaItem(item);
        this.writeTriple(enumerationRdfName, Rdfs.subClassOf, Ec.Enumeration);
        this.writeLabel(enumerationRdfName);
      }
    }
  }
  public writeClass(c: ECClass): void {
    if (this.isNavigationRelationship(c)) {
      return; // navigation relationships are skipped since navigation properties are exported as direct pointers
    }
    const classRdfName = this.formatSchemaItem(c);
    const baseClass: ECClass | undefined = c.getBaseClassSync();
    if (baseClass) {
      this.writeTriple(classRdfName, Rdfs.subClassOf, `${this.formatSchemaItem(baseClass)}`);
    } else {
      switch (c.schemaItemType) {
        case SchemaItemType.CustomAttributeClass:
          this.writeTriple(classRdfName, Rdfs.subClassOf, Ec.CustomAttributeClass);
          break;
        case SchemaItemType.EntityClass:
          this.writeTriple(classRdfName, Rdfs.subClassOf, Ec.EntityClass);
          break;
        case SchemaItemType.Enumeration:
          this.writeTriple(classRdfName, Rdfs.subClassOf, Ec.Enumeration);
          break;
        case SchemaItemType.Mixin:
          this.writeTriple(classRdfName, Rdfs.subClassOf, Ec.Mixin);
          break;
        case SchemaItemType.RelationshipClass:
          this.writeTriple(classRdfName, Rdfs.subClassOf, Ec.RelationshipClass);
          break;
        default:
          throw new Error("Unexpected class type");
      }
    }
    this.writeLabel(classRdfName);
    if (c.description) {
      this.writeComment(classRdfName, c.description);
    }
    if (c.properties) {
      for (const property of c.properties) {
        this.writeProperty(classRdfName, property);
      }
    }
  }
  private isNavigationRelationship(c: ECClass): boolean {
    if (SchemaItemType.RelationshipClass === c.schemaItemType) {
      const baseClass: ECClass | undefined = c.getBaseClassSync();
      if (baseClass) {
        return this.isNavigationRelationship(baseClass);
      }
      return !c.getCustomAttributesSync().has("ECDbMap.LinkTableRelationshipMap");
    }
    return false;
  }
  public formatSchemaItem(schemaItem: SchemaItem): string {
    return `${schemaItem.schema.alias}:${schemaItem.name}`;
  }
  public formatSchemaItemFullName(fullName: string): string {
    const nameParts: string[] = fullName.replace(".", ":").split(":");
    const schema = this.schemaLoader.getSchema(nameParts[0]);
    return this.formatSchemaItem(schema.getItemSync(nameParts[1])!);
  }
  public formatCodeSpecInstanceId(codeSpecId: Id64String): string {
    return `${InstancePrefix.CodeSpec}:c${codeSpecId}`;
  }
  public formatElementInstanceId(elementId: Id64String): string {
    return `${InstancePrefix.Element}:e${elementId}`;
  }
  public formatAspectInstanceId(elementId: Id64String): string {
    return `${InstancePrefix.ElementAspect}:a${elementId}`;
  }
  public formatModelInstanceId(modelId: Id64String): string {
    return `${InstancePrefix.Model}:m${modelId}`;
  }
  public formatRelationshipInstanceId(relationshipId: Id64String): string {
    return `${InstancePrefix.Relationship}:r${relationshipId}`;
  }
  private tryGetECClass(fullName: string): ECClass | undefined {
    const nameParts: string[] = fullName.replace(".", ":").split(":");
    const schema = this.schemaLoader.getSchema(nameParts[0]);
    const schemaItem = schema.getItemSync(nameParts[1]);
    return schemaItem instanceof ECClass ? schemaItem : undefined;
  }
  public writeProperty(classRdfName: string, property: Property): void {
    if (property.isArray()) {
      if (property.isPrimitive()) {
        this.writePropertyTriples(classRdfName, property.name, Ec.PrimitiveArrayProperty, Rdf.List, property.description);
      } else {
        this.writePropertyTriples(classRdfName, property.name, Ec.StructArrayProperty, Rdf.List, property.description);
      }
    } else {
      if (property.isEnumeration()) {
        if (property.enumeration?.fullName) {
          const propertyRange = this.formatSchemaItemFullName(property.enumeration.fullName);
          this.writePropertyTriples(classRdfName, property.name, Ec.PrimitiveProperty, propertyRange, property.description);
        } else if (property.isPrimitive()) {
          this.writePrimitiveProperty(classRdfName, property);
        }
      } else if (property.isNavigation()) {
        this.writeNavigationProperty(classRdfName, property);
      } else if (property.isStruct()) {
        this.writePropertyTriples(classRdfName, property.name, Ec.StructProperty, undefined, property.description);
      } else if (property.isPrimitive()) {
        this.writePrimitiveProperty(classRdfName, property);
      }
    }
  }
  private writeNavigationProperty(classRdfName: string, property: NavigationProperty): void {
    const relationshipClass = this.tryGetECClass(property.relationshipClass.fullName)! as RelationshipClass;
    let constraintClassRdfName: string = Ec.EntityClass;
    switch (property.direction) {
      case StrengthDirection.Forward:
        if (relationshipClass.target.constraintClasses) {
          constraintClassRdfName = this.formatSchemaItemFullName(relationshipClass.target.constraintClasses[0].fullName);
        }
        break;
      case StrengthDirection.Backward:
        if (relationshipClass.source.constraintClasses) {
          constraintClassRdfName = this.formatSchemaItemFullName(relationshipClass.source.constraintClasses[0].fullName);
        }
        break;
    }
    this.writePropertyTriples(classRdfName, property.name, Ec.NavigationProperty, constraintClassRdfName, property.description);
  }
  private writePrimitiveProperty(classRdfName: string, property: PrimitiveProperty): void {
    let propertyRange: string;
    switch (PropertyTypeUtils.getPrimitiveType(property.propertyType)) {
      case PrimitiveType.Binary:
        propertyRange = Xsd.base64Binary;
        if (property.extendedTypeName) {
          switch (property.extendedTypeName.toLocaleLowerCase()) {
            case "beguid": // cspell:ignore BeGuid
              propertyRange = Ec.GuidString;
              break;
          }
        }
        break;
      case PrimitiveType.Boolean:
        propertyRange = Xsd.boolean;
        break;
      case PrimitiveType.DateTime:
        propertyRange = Xsd.dateTime;
        break;
      case PrimitiveType.Double:
        propertyRange = Xsd.double;
        break;
      case PrimitiveType.IGeometry:
        propertyRange = Ec.IGeometry;
        break;
      case PrimitiveType.Integer:
        propertyRange = Xsd.integer;
        break;
      case PrimitiveType.Long:
        propertyRange = Xsd.long;
        break;
      case PrimitiveType.Point2d:
        propertyRange = Ec.Point2d;
        break;
      case PrimitiveType.Point3d:
        propertyRange = Ec.Point3d;
        break;
      case PrimitiveType.String:
        propertyRange = Xsd.string;
        if (property.extendedTypeName) {
          switch (property.extendedTypeName.toLocaleLowerCase()) {
            case "json":
              propertyRange = Ec.JsonString;
              break;
          }
        }
        break;
      default:
        throw new Error("Unexpected PrimitiveType");
    }
    this.writePropertyTriples(classRdfName, property.name, Ec.PrimitiveProperty, propertyRange, property.description);
  }
  private writePropertyTriples(classRdfName: string, propertyName: string, subClassOf: string, range: string | undefined, comment?: string): void {
    const propertyRdfName = `${classRdfName}-${propertyName}`;
    const propertyLabel = `${classRdfName}.${propertyName}`;
    this.writeLabel(propertyRdfName, propertyLabel);
    this.writeTriple(propertyRdfName, Rdfs.subClassOf, subClassOf);
    this.writeTriple(propertyRdfName, Rdfs.domain, classRdfName);
    if (range) {
      this.writeTriple(propertyRdfName, Rdfs.range, range);
    }
    if (comment) {
      this.writeComment(propertyRdfName, comment);
    }
  }
  private writeEntityInstanceProperties(entity: Entity, entityClass: ECClass, entityInstanceRdfName: string): void {
    const entityClassRdfName = this.formatSchemaItemFullName(entityClass.fullName);
    if (entityClass.properties) {
      for (const property of entityClass.properties) {
        const propertyJsonName = property.name[0].toLowerCase() + property.name.substring(1);
        const propertyValue = (entity as any)[propertyJsonName];
        if (propertyValue) {
          this.writePropertyValue(entityInstanceRdfName, `${entityClassRdfName}-${property.name}`, property, propertyValue);
        }
      }
    }
    const baseClass: ECClass | undefined = entityClass.getBaseClassSync();
    if (baseClass) {
      this.writeEntityInstanceProperties(entity, baseClass, entityInstanceRdfName);
    }
  }
  private writePropertyValue(elementInstanceRdfName: string, propertyRdfName: string, property: Property, propertyValue: any): void {
    if (property.isPrimitive()) {
      switch (property.primitiveType) {
        case PrimitiveType.Binary: // Binary is not exported unless there is a recognized extendedType
          if (property.extendedTypeName) {
            switch (property.extendedTypeName.toLowerCase()) {
              case "beguid":
                this.writeTriple(elementInstanceRdfName, propertyRdfName, JSON.stringify(propertyValue)); // use JSON.stringify to add surrounding quotes
                break;
            }
          }
          break;
        case PrimitiveType.Point2d:
        case PrimitiveType.Point3d:
          this.writeTriple(elementInstanceRdfName, propertyRdfName, JSON.stringify(JSON.stringify(propertyValue))); // use 2nd JSON.stringify to add surrounding quotes
          break;
        case PrimitiveType.String:
          if (property.extendedTypeName?.toLowerCase() === "json") {
            if (Object.keys(propertyValue).length > 0) {
              // Call JSON.stringify twice to add surrounding quotes and escape internal quotes
              this.writeTriple(elementInstanceRdfName, propertyRdfName, JSON.stringify(JSON.stringify(propertyValue)));
            }
          } else {
            this.writeTriple(elementInstanceRdfName, propertyRdfName, JSON.stringify(propertyValue)); // use JSON.stringify to add surrounding quotes
          }
          break;
        case PrimitiveType.Long:
          if (property.extendedTypeName) {
            switch (property.extendedTypeName.toLowerCase()) {
              case "id":
                const elementId: Id64String = RelatedElement.idFromJson(propertyValue);
                if (elementId && Id64.isValidId64(elementId)) {
                  this.writeTriple(elementInstanceRdfName, propertyRdfName, this.formatElementInstanceId(elementId));
                }
                break;
              default:
                this.writeTriple(elementInstanceRdfName, propertyRdfName, propertyValue);
                break;
            }
          }
          break;
        default:
          this.writeTriple(elementInstanceRdfName, propertyRdfName, propertyValue);
          break;
      }
    } else if (property.isNavigation()) {
      const relatedEntityId: Id64String = RelatedElement.idFromJson(propertyValue);
      if (relatedEntityId && Id64.isValidId64(relatedEntityId)) {
        const relatedEntityRdfName = property.name.endsWith("Model") ? this.formatModelInstanceId(relatedEntityId) : this.formatElementInstanceId(relatedEntityId);
        this.writeTriple(elementInstanceRdfName, propertyRdfName, relatedEntityRdfName);
      }
    }
  }
}
