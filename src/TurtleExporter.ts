/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ECClass, PrimitiveType, Property, PropertyTypeUtils, Schema, SchemaItemType } from "@bentley/ecschema-metadata";
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
  EntityClass = "ec:EntityClass",
  RelationshipClass = "ec:RelationshipClass",
  CustomAttributeClass = "ec:CustomAttributeClass",
  Enumeration = "ec:Enumeration",
  IGeometry = "ec:IGeometry",
  Mixin = "ec:Mixin",
  PrimitiveProperty = "ec:PrimitiveProperty",
  StructProperty = "ec:StructProperty",
  PrimitiveArrayProperty = "ec:PrimitiveArrayProperty",
  StructArrayProperty = "ec:StructArrayProperty",
  NavigationProperty = "ec:NavigationProperty",
  Point2d = "ec:Point2d",
  Point3d = "ec:Point3d",
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
    this.writeEcPrefix();
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
  private writeEcPrefix(): void {
    this.writePrefix(ec.prefix, ec.iri);
  }
  private writeEcTypes(): void {
    this.writeTriple(ec.EntityClass, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.RelationshipClass, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.CustomAttributeClass, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.Enumeration, rdfs.subClassOf, rdfs.Class);
    this.writeTriple(ec.PrimitiveProperty, rdfs.subClassOf, rdf.Property);
    this.writeTriple(ec.PrimitiveArrayProperty, rdfs.subClassOf, rdf.Property);
    this.writeTriple(ec.StructProperty, rdfs.subClassOf, rdf.Property);
    this.writeTriple(ec.StructArrayProperty, rdfs.subClassOf, rdf.Property);
    this.writeTriple(ec.NavigationProperty, rdfs.subClassOf, rdf.Property);
  }
  public writeSchema(schema: Schema): void {
    this.writePrefix(schema.alias, `http://www.example.org/schemas/${schema.schemaKey}#`);
    for (const c of schema.getClasses()) {
      this.writeClass(c);
    }
  }
  public writeClass(c: ECClass): void {
    const classRdfName = this.formatClass(c);
    this.writeClassType(classRdfName, c);
    this.writeTriple(classRdfName, rdfs.label, `"${c.label ?? c.name}"`);
    const baseClass: ECClass | undefined = c.getBaseClassSync();
    if (baseClass) {
      this.writeTriple(classRdfName, rdfs.subClassOf, `${this.formatClass(baseClass)}`);
    }
    if (c.description) {
      this.writeTriple(classRdfName, rdfs.comment, `"${c.description}"`);
    }
    if (c.properties) {
      for (const property of c.properties) {
        this.writeProperty(classRdfName, property);
      }
    }
  }
  private writeClassType(classRdfName: string, c: ECClass): void {
    switch (c.schemaItemType) {
      case SchemaItemType.CustomAttributeClass:
        this.writeTriple(classRdfName, rdf.type, ec.CustomAttributeClass);
        break;
      case SchemaItemType.EntityClass:
        this.writeTriple(classRdfName, rdf.type, ec.EntityClass);
        break;
      case SchemaItemType.Enumeration:
        this.writeTriple(classRdfName, rdf.type, ec.Enumeration);
        break;
      case SchemaItemType.Mixin:
        this.writeTriple(classRdfName, rdf.type, ec.Mixin);
        break;
      case SchemaItemType.RelationshipClass:
        this.writeTriple(classRdfName, rdf.type, ec.RelationshipClass);
        break;
      default:
        throw new Error("Unexpected class type");
    }
  }
  public formatClass(c: ECClass): string {
    return `${c.schema.alias}:${c.name}`;
  }
  public formatClassFullName(classFullName: string): string {
    const classNameParts: string[] = classFullName.replace(".", ":").split(":");
    const schema = this.schemaLoader.getSchema(classNameParts[0]);
    return this.formatClass(schema.getItemSync<ECClass>(classNameParts[1])!);
  }
  public writeProperty(classRdfName: string, property: Property): void {
    const propertyRdfName = `${classRdfName}-${property.name}`;
    this.writeTriple(propertyRdfName, rdfs.domain, classRdfName);
    this.writePropertyType(propertyRdfName, property);
    this.writeTriple(propertyRdfName, rdfs.label, `"${property.label ?? property.name}"`);
    if (property.description) {
      this.writeTriple(propertyRdfName, rdfs.comment, `"${property.description}"`);
    }
  }
  private writePropertyType(propertyRdfName: string, property: Property): void {
    if (property.isArray()) {
      this.writeTriple(propertyRdfName, rdf.type, property.isPrimitive() ? ec.PrimitiveArrayProperty : ec.StructArrayProperty);
    } else {
      if (property.isEnumeration()) {
        this.writeTriple(propertyRdfName, rdf.type, ec.PrimitiveProperty);
        if (property.enumeration?.fullName) {
          this.writeTriple(propertyRdfName, rdfs.range, this.formatClassFullName(property.enumeration.fullName));
        } else {
          this.writePrimitiveType(propertyRdfName, PropertyTypeUtils.getPrimitiveType(property.propertyType));
        }
      } else if (property.isNavigation()) {
        this.writeTriple(propertyRdfName, rdf.type, ec.NavigationProperty);
        this.writeTriple(propertyRdfName, rdfs.range, this.formatClassFullName(property.relationshipClass.fullName));
      } else if (property.isStruct()) {
        this.writeTriple(propertyRdfName, rdf.type, ec.StructProperty);
      } else if (property.isPrimitive()) {
        this.writeTriple(propertyRdfName, rdf.type, ec.PrimitiveProperty);
        this.writePrimitiveType(propertyRdfName, PropertyTypeUtils.getPrimitiveType(property.propertyType));
      }
    }
  }
  private writePrimitiveType(propertyRdfName: string, primitiveType: PrimitiveType): void {
    switch (primitiveType) { // see https://www.w3.org/TR/rdf11-concepts/#dfn-rdf-compatible-xsd-types
      case PrimitiveType.Binary:
        this.writeTriple(propertyRdfName, rdfs.range, xsd.base64Binary);
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
        break;
    }
  }
}
