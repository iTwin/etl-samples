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
  LinkTableRelationshipClass = "ec:LinkTableRelationshipClass",
  NavigationRelationshipClass = "ec:NavigationRelationshipClass",
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
  BackingRelationship = "ec:BackingRelationship",
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
    this.writeTriple(ec.LinkTableRelationshipClass, rdfs.subClassOf, ec.RelationshipClass);
    this.writeTriple(ec.NavigationRelationshipClass, rdfs.subClassOf, ec.RelationshipClass);
    this.writeTriple(ec.CustomAttributeClass, rdfs.subClassOf, ec.Class);
    this.writeTriple(ec.Enumeration, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.Mixin, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.Point2d, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.Point3d, rdfs.subClassOf, rdfs.Class);
    // rdf.Property types
    this.writeEcIdProperty(ec.EntityClass, "Id", "The ECInstanceId for the entity instance");
    this.writeEcIdProperty(ec.LinkTableRelationshipClass, "Id", "The ECInstanceId of the relationship");
    this.writeEcIdProperty(ec.LinkTableRelationshipClass, "SourceId", "The SourceECInstanceId or *source* of the relationship");
    this.writeEcIdProperty(ec.LinkTableRelationshipClass, "TargetId", "The TargetECInstanceId or *target* of the relationship");
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
  private writeEcIdProperty(rdfName: string, idName: string, comment?: string): void {
    this.writeTriple(`${rdfName}-${idName}`, rdfs.subClassOf, ec.PrimitiveProperty);
    this.writeTriple(`${rdfName}-${idName}`, rdfs.domain, rdfName);
    this.writeTriple(`${rdfName}-${idName}`, rdfs.range, ec.Id64String);
    this.writeLabel(`${rdfName}-${idName}`, `${rdfName}.${idName}`);
    if (comment) {
      this.writeComment(rdfName, comment);
    }
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
    const classRdfName = this.formatSchemaItem(c);
    this.writeClassSubClassOf(classRdfName, c);
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
  private writeClassSubClassOf(classRdfName: string, c: ECClass): void {
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
          if (c.getCustomAttributesSync().has("ECDbMap.LinkTableRelationshipMap")) {
            this.writeTriple(classRdfName, rdfs.subClassOf, ec.LinkTableRelationshipClass);
          } else {
            this.writeTriple(classRdfName, rdfs.subClassOf, ec.NavigationRelationshipClass);
          }
          break;
        default:
          throw new Error("Unexpected class type");
      }
    }
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
    const propertyRdfName = `${classRdfName}-${property.name}`;
    this.writeTriple(propertyRdfName, rdfs.domain, classRdfName);
    this.writePropertySubClassOf(propertyRdfName, property);
    this.writeLabel(propertyRdfName, `${property.schema.alias}:${property.class.name}.${property.name}`);
    if (property.description) {
      this.writeComment(propertyRdfName, property.description);
    }
  }
  private writePropertySubClassOf(propertyRdfName: string, property: Property): void {
    if (property.isArray()) {
      this.writeTriple(propertyRdfName, rdfs.subClassOf, property.isPrimitive() ? ec.PrimitiveArrayProperty : ec.StructArrayProperty);
    } else {
      if (property.isEnumeration()) {
        this.writeTriple(propertyRdfName, rdfs.subClassOf, ec.PrimitiveProperty);
        if (property.enumeration?.fullName) {
          this.writeTriple(propertyRdfName, rdfs.range, this.formatSchemaItemFullName(property.enumeration.fullName));
        } else if (property.isPrimitive()) {
          this.writePrimitiveType(propertyRdfName, property);
        }
      } else if (property.isNavigation()) {
        this.writeTriple(propertyRdfName, rdfs.subClassOf, ec.NavigationProperty);
        this.writeTriple(propertyRdfName, rdfs.range, xsd.string);
        this.writeTriple(propertyRdfName, rdfs.range, ec.Id64String);
        this.writeTriple(propertyRdfName, ec.BackingRelationship, this.formatSchemaItemFullName(property.relationshipClass.fullName));
      } else if (property.isStruct()) {
        this.writeTriple(propertyRdfName, rdfs.subClassOf, ec.StructProperty);
      } else if (property.isPrimitive()) {
        this.writePrimitiveType(propertyRdfName, property);
      }
    }
  }
  private writePrimitiveType(propertyRdfName: string, property: PrimitiveProperty): void {
    this.writeTriple(propertyRdfName, rdfs.subClassOf, ec.PrimitiveProperty);
    const primitiveType: PrimitiveType = PropertyTypeUtils.getPrimitiveType(property.propertyType);
    switch (primitiveType) {
      case PrimitiveType.Binary:
        if (property.extendedTypeName) {
          switch (property.extendedTypeName.toLocaleLowerCase()) {
            case "beguid": // cspell:ignore BeGuid
              this.writeTriple(propertyRdfName, rdfs.range, xsd.string);
              this.writeTriple(propertyRdfName, rdfs.range, ec.GuidString);
              break;
            default:
              this.writeTriple(propertyRdfName, rdfs.range, xsd.base64Binary);
              break;
          }
        } else {
          this.writeTriple(propertyRdfName, rdfs.range, xsd.base64Binary);
        }
        break;
      case PrimitiveType.Boolean:
        this.writeTriple(propertyRdfName, rdfs.range, xsd.boolean);
        break;
      case PrimitiveType.DateTime:
        this.writeTriple(propertyRdfName, rdfs.range, xsd.dateTime);
        break;
      case PrimitiveType.Double:
        this.writeTriple(propertyRdfName, rdfs.range, xsd.double);
        break;
      case PrimitiveType.IGeometry:
        this.writeTriple(propertyRdfName, rdfs.range, ec.IGeometry);
        break;
      case PrimitiveType.Integer:
        this.writeTriple(propertyRdfName, rdfs.range, xsd.integer);
        break;
      case PrimitiveType.Long:
        this.writeTriple(propertyRdfName, rdfs.range, xsd.long);
        break;
      case PrimitiveType.Point2d:
        this.writeTriple(propertyRdfName, rdfs.range, ec.Point2d);
        break;
      case PrimitiveType.Point3d:
        this.writeTriple(propertyRdfName, rdfs.range, ec.Point3d);
        break;
      case PrimitiveType.String:
        this.writeTriple(propertyRdfName, rdfs.range, xsd.string);
        if (property.extendedTypeName) {
          switch (property.extendedTypeName.toLocaleLowerCase()) {
            case "json":
              this.writeTriple(propertyRdfName, rdfs.range, ec.JsonString);
              break;
          }
        }
        break;
      default:
        throw new Error("Unexpected PrimitiveType");
    }
  }
}
