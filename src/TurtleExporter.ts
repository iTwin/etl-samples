/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  ECClass, PrimitiveProperty, PrimitiveType, Property, PropertyTypeUtils, Schema, SchemaItem, SchemaItemType,
} from "@bentley/ecschema-metadata";
import { IModelDb, IModelJsFs as fs } from "@bentley/imodeljs-backend";
import { IModelSchemaLoader } from "@bentley/imodeljs-backend/lib/IModelSchemaLoader";

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

/** Exports iModel data to the Terse RDF Triple Language file format.
 * @see https://en.wikipedia.org/wiki/Turtle_(syntax)
 */
export class TurtleExporter {
  public sourceDb: IModelDb;
  public schemaLoader: IModelSchemaLoader;
  public targetFileName: string;
  constructor(sourceDb: IModelDb, targetFileName: string) {
    if (fs.existsSync(targetFileName)) {
      fs.removeSync(targetFileName);
    }
    this.sourceDb = sourceDb;
    this.schemaLoader = new IModelSchemaLoader(sourceDb);
    this.targetFileName = targetFileName;
    this.writeRdfPrefix();
    this.writeRdfsPrefix();
    this.writeXsdPrefix();
    this.writeEcTypes();
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
        this.writePropertyTriples(classRdfName, property.name, ec.NavigationProperty, ec.EntityClass, property.description);
      } else if (property.isStruct()) {
        this.writePropertyTriples(classRdfName, property.name, ec.StructProperty, undefined, property.description);
      } else if (property.isPrimitive()) {
        this.writePrimitiveProperty(classRdfName, property);
      }
    }
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
