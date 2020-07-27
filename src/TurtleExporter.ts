/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Id64, Id64String } from "@bentley/bentleyjs-core";
import {
  ECClass, NavigationProperty, PrimitiveProperty, PrimitiveType, Property, PropertyTypeUtils, RelationshipClass, Schema, SchemaItem, SchemaItemType,
  StrengthDirection,
} from "@bentley/ecschema-metadata";
import {
  BisCoreSchema, Element, GenericSchema, IModelDb, IModelExporter, IModelExportHandler, IModelJsFs as fs, Model, Relationship,
} from "@bentley/imodeljs-backend";
import { IModelSchemaLoader } from "@bentley/imodeljs-backend/lib/IModelSchemaLoader"; // WIP: import from imodeljs-backend when available
import { CodeSpec, IModel } from "@bentley/imodeljs-common";

/** Enumeration of RDF types.
 * @see https://www.w3.org/TR/rdf11-concepts/
 */
enum rdf {
  prefix = "rdf",
  iri = "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  type = "rdf:type",
  Property = "rdf:Property",
  List = "rdf:List",
}

/** Enumeration of RDF Schema (RDFS) types.
 * @see https://www.w3.org/TR/rdf-schema/
 */
enum rdfs {
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
enum xsd {
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
enum ec {
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
  public static export(iModelDb: IModelDb, outputFileName: string): void {
    const handler = new TurtleExporter(iModelDb, outputFileName);
    handler.writeRdfPrefix();
    handler.writeRdfsPrefix();
    handler.writeXsdPrefix();
    handler.writeEcTypes();
    if (false) {
      // this.exporter.exportSchemas(); // WIP: waiting for exportSchemas method to show up in published packages
    } else {
      const schemasNames = [BisCoreSchema.schemaName, GenericSchema.schemaName];
      for (const schemaName of schemasNames) {
        const schema = handler.schemaLoader.getSchema(schemaName);
        handler.writeSchema(schema);
      }
    }
    handler.writeInstancePrefixes();
    handler.iModelExporter.exportAll();
  }
  /** Override of IModelExportHandler.onExportCodeSpec */
  protected onExportCodeSpec(codeSpec: CodeSpec, isUpdate: boolean | undefined): void {
    const codeSpecClassRdfName = this.formatSchemaItemFullName("BisCore:CodeSpec");
    const codeSpecInstanceRdfName = this.formatCodeSpecInstanceId(codeSpec.id);
    this.writeTriple(codeSpecInstanceRdfName, rdf.type, codeSpecClassRdfName);
    this.writeTriple(codeSpecInstanceRdfName, `${codeSpecClassRdfName}-Name`, `"${codeSpec.name}"`);
    super.onExportCodeSpec(codeSpec, isUpdate); // call super to continue export
  }
  /** Override of IModelExportHandler.onExportElement */
  protected onExportElement(element: Element, isUpdate: boolean | undefined): void {
    const bisElementClassRdfName = this.formatSchemaItemFullName(Element.classFullName);
    const elementClassRdfName = this.formatSchemaItemFullName(element.classFullName);
    const elementInstanceRdfName = this.formatElementInstanceId(element.id);
    this.writeTriple(elementInstanceRdfName, rdf.type, elementClassRdfName);
    this.writeTriple(elementInstanceRdfName, `${bisElementClassRdfName}-Model`, this.formatModelInstanceId(element.model));
    if (element.code.getValue() !== "") {
      this.writeTriple(elementInstanceRdfName, `${bisElementClassRdfName}-CodeSpec`, this.formatCodeSpecInstanceId(element.code.spec));
      this.writeTriple(elementInstanceRdfName, `${bisElementClassRdfName}-CodeScope`, this.formatElementInstanceId(element.code.scope));
      this.writeTriple(elementInstanceRdfName, `${bisElementClassRdfName}-CodeValue`, `"${element.code.getValue()}"`);
    }
    if (element.federationGuid) {
      this.writeTriple(elementInstanceRdfName, `${bisElementClassRdfName}-FederationGuid`, `"${element.federationGuid}"`);
    }
    if (element.userLabel) {
      this.writeTriple(elementInstanceRdfName, `${bisElementClassRdfName}-UserLabel`, `"${element.userLabel}"`);
    }
    if (element.parent?.id && Id64.isValidId64(element.parent.id)) {
      this.writeTriple(elementInstanceRdfName, `${bisElementClassRdfName}-Parent`, this.formatElementInstanceId(element.parent.id));
    }
    super.onExportElement(element, isUpdate); // call super to continue export
  }
  /** Override of IModelExportHandler.onExportModel */
  protected onExportModel(model: Model, isUpdate: boolean | undefined): void {
    const bisModelClassRdfName = this.formatSchemaItemFullName(Model.classFullName);
    const modelClassRdfName = this.formatSchemaItemFullName(model.classFullName);
    const modelInstanceRdfName = this.formatModelInstanceId(model.id);
    this.writeTriple(modelInstanceRdfName, rdf.type, modelClassRdfName);
    if (IModel.repositoryModelId !== model.id) {
      this.writeTriple(modelInstanceRdfName, `${bisModelClassRdfName}-ModeledElement`, this.formatElementInstanceId(model.modeledElement.id));
    }
    super.onExportModel(model, isUpdate); // call super to continue export
  }
  /** Override of IModelExportHandler.onExportRelationship */
  protected onExportRelationship(relationship: Relationship, isUpdate: boolean | undefined): void {
    const relationshipClassRdfName = this.formatSchemaItemFullName(relationship.classFullName);
    const relationshipInstanceRdfName = this.formatRelationshipInstanceId(relationship.id);
    this.writeTriple(relationshipInstanceRdfName, rdf.type, relationshipClassRdfName);
    this.writeTriple(relationshipInstanceRdfName, `${ec.RelationshipClass}-Source`, this.formatElementInstanceId(relationship.sourceId));
    this.writeTriple(relationshipInstanceRdfName, `${ec.RelationshipClass}-Target`, this.formatElementInstanceId(relationship.targetId));
    super.onExportRelationship(relationship, isUpdate); // call super to continue export
  }
  public writeTriple(subject: string, predicate: string, object: any): void {
    fs.appendFileSync(this.targetFileName, `${subject} ${predicate} ${object} .\n`);
  }
  public writePrefix(prefix: string, iri: string): void {
    this.writeTriple("@prefix", `${prefix}:`, `<${iri}>`);
  }
  private writeRdfPrefix(): void {
    this.writePrefix(rdf.prefix, rdf.iri);
  }
  private writeRdfsPrefix(): void {
    this.writePrefix(rdfs.prefix, rdfs.iri);
  }
  private writeXsdPrefix(): void {
    this.writePrefix(xsd.prefix, xsd.iri);
  }
  public writeInstancePrefixes(): void {
    const basePrefix = `http://www.example.org/iModel/${this.sourceDb.iModelId}/`;
    this.writePrefix(InstancePrefix.Element, `${basePrefix}codeSpec#`);
    this.writePrefix(InstancePrefix.ElementAspect, `${basePrefix}aspect#`);
    this.writePrefix(InstancePrefix.CodeSpec, `${basePrefix}element#`);
    this.writePrefix(InstancePrefix.Model, `${basePrefix}model#`);
    this.writePrefix(InstancePrefix.Relationship, `${basePrefix}relationship#`);
  }
  private writeEcTypes(): void {
    this.writePrefix(ec.prefix, ec.iri);
    // rdfs:Class types
    this.writeTriple(ec.Class, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.EntityClass, rdfs.subClassOf, ec.Class);
    this.writeTriple(ec.RelationshipClass, rdfs.subClassOf, ec.Class);
    this.writeTriple(ec.CustomAttributeClass, rdfs.subClassOf, ec.Class);
    this.writeTriple(ec.Mixin, rdfs.subClassOf, ec.Class);
    this.writeTriple(ec.Enumeration, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.Point2d, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.Point3d, rdfs.subClassOf, rdfs.Class);
    // rdf.Property types
    this.writePropertyTriples(ec.EntityClass, "Id", ec.PrimitiveProperty, ec.Id64String, "Id of the entity instance");
    this.writePropertyTriples(ec.RelationshipClass, "Id", ec.PrimitiveProperty, ec.Id64String, "Id of the relationship instance");
    this.writePropertyTriples(ec.RelationshipClass, "Source", ec.NavigationProperty, ec.EntityClass, "The source of the relationship");
    this.writePropertyTriples(ec.RelationshipClass, "Target", ec.NavigationProperty, ec.EntityClass, "The target of the relationship");
    this.writeTriple(ec.Property, rdfs.subClassOf, rdf.Property);
    this.writeTriple(ec.PrimitiveProperty, rdfs.subClassOf, ec.Property);
    this.writeTriple(ec.PrimitiveArrayProperty, rdfs.subClassOf, ec.Property);
    this.writeTriple(ec.StructProperty, rdfs.subClassOf, ec.Property);
    this.writeTriple(ec.StructArrayProperty, rdfs.subClassOf, ec.Property);
    this.writeTriple(ec.NavigationProperty, rdfs.subClassOf, ec.Property);
    // primitive types
    this.writeTriple(ec.GuidString, rdfs.subClassOf, xsd.string);
    this.writeTriple(ec.Id64String, rdfs.subClassOf, xsd.string);
    this.writeTriple(ec.JsonString, rdfs.subClassOf, xsd.string);
    // write consistent labels for each "ec" enum member
    Object.keys(ec).forEach((key) => this.writeLabel(`ec:${key}`));
  }
  public writeLabel(rdfName: string, label: string = rdfName): void {
    this.writeTriple(rdfName, rdfs.label, `"${label}"`);
  }
  public writeComment(rdfName: string, comment: string): void {
    this.writeTriple(rdfName, rdfs.comment, `"${comment}"`);
  }
  public writeSchema(schema: Schema): void {
    this.writePrefix(schema.alias, `http://www.example.org/schemas/${schema.schemaKey}#`);
    for (const item of schema.getItems()) {
      if (item instanceof ECClass) {
        this.writeClass(item);
      } else if (SchemaItemType.Enumeration === item.schemaItemType) {
        const enumerationRdfName = this.formatSchemaItem(item);
        this.writeTriple(enumerationRdfName, rdfs.subClassOf, ec.Enumeration);
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
      this.writeTriple(classRdfName, rdfs.subClassOf, `${this.formatSchemaItem(baseClass)}`);
    } else {
      switch (c.schemaItemType) {
        case SchemaItemType.CustomAttributeClass:
          this.writeTriple(classRdfName, rdfs.subClassOf, ec.CustomAttributeClass);
          break;
        case SchemaItemType.EntityClass:
          this.writeTriple(classRdfName, rdfs.subClassOf, ec.EntityClass);
          break;
        case SchemaItemType.Enumeration:
          this.writeTriple(classRdfName, rdfs.subClassOf, ec.Enumeration);
          break;
        case SchemaItemType.Mixin:
          this.writeTriple(classRdfName, rdfs.subClassOf, ec.Mixin);
          break;
        case SchemaItemType.RelationshipClass:
          this.writeTriple(classRdfName, rdfs.subClassOf, ec.RelationshipClass);
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
  public formatModelInstanceId(modelId: Id64String): string {
    return `${InstancePrefix.Model}:m${modelId}`;
  }
  public formatRelationshipInstanceId(relationshipId: Id64String): string {
    return `${InstancePrefix.Relationship}:r${relationshipId}`;
  }
  private tryGetClass(fullName: string): ECClass | undefined {
    const nameParts: string[] = fullName.replace(".", ":").split(":");
    const schema = this.schemaLoader.getSchema(nameParts[0]);
    const schemaItem = schema.getItemSync(nameParts[1]);
    return schemaItem instanceof ECClass ? schemaItem : undefined;
  }
  public writeProperty(classRdfName: string, property: Property): void {
    if (property.isArray()) {
      if (property.isPrimitive()) {
        this.writePropertyTriples(classRdfName, property.name, ec.PrimitiveArrayProperty, rdf.List, property.description);
      } else {
        this.writePropertyTriples(classRdfName, property.name, ec.StructArrayProperty, rdf.List, property.description);
      }
    } else {
      if (property.isEnumeration()) {
        if (property.enumeration?.fullName) {
          const propertyRange = this.formatSchemaItemFullName(property.enumeration.fullName);
          this.writePropertyTriples(classRdfName, property.name, ec.PrimitiveProperty, propertyRange, property.description);
        } else if (property.isPrimitive()) {
          this.writePrimitiveProperty(classRdfName, property);
        }
      } else if (property.isNavigation()) {
        this.writeNavigationProperty(classRdfName, property);
      } else if (property.isStruct()) {
        this.writePropertyTriples(classRdfName, property.name, ec.StructProperty, undefined, property.description);
      } else if (property.isPrimitive()) {
        this.writePrimitiveProperty(classRdfName, property);
      }
    }
  }
  private writeNavigationProperty(classRdfName: string, property: NavigationProperty): void {
    const relationshipClass = this.tryGetClass(property.relationshipClass.fullName)! as RelationshipClass;
    let constraintClassRdfName: string = ec.EntityClass;
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
    this.writePropertyTriples(classRdfName, property.name, ec.NavigationProperty, constraintClassRdfName, property.description);
  }
  private writePrimitiveProperty(classRdfName: string, property: PrimitiveProperty): void {
    let propertyRange: string;
    switch (PropertyTypeUtils.getPrimitiveType(property.propertyType)) {
      case PrimitiveType.Binary:
        propertyRange = xsd.base64Binary;
        if (property.extendedTypeName) {
          switch (property.extendedTypeName.toLocaleLowerCase()) {
            case "beguid": // cspell:ignore BeGuid
              propertyRange = ec.GuidString;
              break;
          }
        }
        break;
      case PrimitiveType.Boolean:
        propertyRange = xsd.boolean;
        break;
      case PrimitiveType.DateTime:
        propertyRange = xsd.dateTime;
        break;
      case PrimitiveType.Double:
        propertyRange = xsd.double;
        break;
      case PrimitiveType.IGeometry:
        propertyRange = ec.IGeometry;
        break;
      case PrimitiveType.Integer:
        propertyRange = xsd.integer;
        break;
      case PrimitiveType.Long:
        propertyRange = xsd.long;
        break;
      case PrimitiveType.Point2d:
        propertyRange = ec.Point2d;
        break;
      case PrimitiveType.Point3d:
        propertyRange = ec.Point3d;
        break;
      case PrimitiveType.String:
        propertyRange = xsd.string;
        if (property.extendedTypeName) {
          switch (property.extendedTypeName.toLocaleLowerCase()) {
            case "json":
              propertyRange = ec.JsonString;
              break;
          }
        }
        break;
      default:
        throw new Error("Unexpected PrimitiveType");
    }
    this.writePropertyTriples(classRdfName, property.name, ec.PrimitiveProperty, propertyRange, property.description);
  }
  private writePropertyTriples(classRdfName: string, propertyName: string, subClassOf: string, range: string | undefined, comment?: string): void {
    const propertyRdfName = `${classRdfName}-${propertyName}`;
    const propertyLabel = `${classRdfName}.${propertyName}`;
    this.writeLabel(propertyRdfName, propertyLabel);
    this.writeTriple(propertyRdfName, rdfs.subClassOf, subClassOf);
    this.writeTriple(propertyRdfName, rdfs.domain, classRdfName);
    if (range) {
      this.writeTriple(propertyRdfName, rdfs.range, range);
    }
    if (comment) {
      this.writeComment(propertyRdfName, comment);
    }
  }
}
