/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { DbResult, Id64String } from "@bentley/bentleyjs-core";
import { Schema } from "@bentley/ecschema-metadata";
import {
  ECSqlStatement, Element, GeometricElement2d, GeometricElement3d, GeometricModel2d, GeometricModel3d, IModelDb, IModelExporter, IModelExportHandler,
  IModelJsFs, InformationPartitionElement, Model,
} from "@bentley/imodeljs-backend";
import { IModel } from "@bentley/imodeljs-common";

/** Exports a summary of the iModel contents to an output text file. */
export class SummaryExporter extends IModelExportHandler {
  public outputFileName: string;
  public iModelExporter: IModelExporter;
  private _indentMap: Map<Id64String, number> = new Map();

  /** Construct a new SummaryExporter */
  public constructor(sourceDb: IModelDb, outputFileName: string) {
    super();
    if (IModelJsFs.existsSync(outputFileName)) {
      IModelJsFs.removeSync(outputFileName);
    }
    this.outputFileName = outputFileName;
    this.iModelExporter = new IModelExporter(sourceDb);
    this.iModelExporter.registerHandler(this);
    this._indentMap.set(IModel.rootSubjectId, 0);
  }

  /** Initiate the export */
  public static export(iModelDb: IModelDb, outputFileName: string): void {
    const handler = new SummaryExporter(iModelDb, outputFileName);
    // WIP: enable optimization when available in 2.6
    // handler.iModelExporter.visitElements = true;
    // handler.iModelExporter.visitRelationships = false;
    handler.iModelExporter.wantGeometry = false;
    handler.writeSectionHeader("Schemas");
    handler.iModelExporter.exportSchemas();
    handler.writeClassCounts();
    handler.writeSectionHeader("RepositoryModel");
    handler.iModelExporter.exportElement(IModel.rootSubjectId); // Get Subject/Partition hierarchy from RepositoryModel
    // WIP: enable optimization when available in 2.6
    // handler.iModelExporter.visitElements = false; // Only want element detail for the RepositoryModel
    handler.iModelExporter.exportAll();
  }

  /** Write a line to the output file. */
  private writeLine(line: string): void {
    IModelJsFs.appendFileSync(this.outputFileName, line);
    IModelJsFs.appendFileSync(this.outputFileName, "\n");
  }

  /** Write a section header to the output file */
  private writeSectionHeader(sectionTitle: string): void {
    IModelJsFs.appendFileSync(this.outputFileName, "\n");
    IModelJsFs.appendFileSync(this.outputFileName, "+--------------------------------------------------------------+\n");
    IModelJsFs.appendFileSync(this.outputFileName, `| ${sectionTitle}\n`);
    IModelJsFs.appendFileSync(this.outputFileName, "+--------------------------------------------------------------+\n");
  }

  private writeClassCounts(): void {
    const sourceDb = this.iModelExporter.sourceDb;
    this.writeSectionHeader("Model Classes with (Instance Counts)");
    const modelClassesSql = `SELECT DISTINCT ECClassId FROM ${Model.classFullName}`;
    sourceDb.withPreparedStatement(modelClassesSql, (modelClassesStatement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === modelClassesStatement.step()) {
        const modelClassFullName = modelClassesStatement.getValue(0).getClassNameForClassId();
        const modelClassCountSql = `SELECT COUNT(*) FROM ${modelClassFullName}`;
        const numModelInstances = sourceDb.withPreparedStatement(modelClassCountSql, (modelInstancesStatement: ECSqlStatement): number => {
          return DbResult.BE_SQLITE_ROW === modelInstancesStatement.step() ? modelInstancesStatement.getValue(0).getInteger() : 0;
        });
        this.writeLine(`${modelClassFullName} (${numModelInstances})`);
      }
    });
    this.writeSectionHeader("Element Classes with (Instance Counts)");
    const elementClassesSql = `SELECT DISTINCT ECClassId FROM ${Element.classFullName}`;
    sourceDb.withPreparedStatement(elementClassesSql, (elementClassesStatement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === elementClassesStatement.step()) {
        const elementClassNameParts = elementClassesStatement.getValue(0).getClassNameForClassId().split(".");
        const elementClassSqlName = `[${elementClassNameParts[0]}]:[${elementClassNameParts[1]}]`;
        const elementClassCountSql = `SELECT COUNT(*) FROM ${elementClassSqlName}`;
        const numElementInstances = sourceDb.withPreparedStatement(elementClassCountSql, (elementInstancesStatement: ECSqlStatement): number => {
          return DbResult.BE_SQLITE_ROW === elementInstancesStatement.step() ? elementInstancesStatement.getValue(0).getInteger() : 0;
        });
        this.writeLine(`${elementClassNameParts.join(":")} (${numElementInstances})`);
      }
    });
  }

  /** Override of IModelExportHandler.onExportSchema */
  protected onExportSchema(schema: Schema): void {
    this.writeLine(`${schema.name}, version=${schema.schemaKey.version}`);
    super.onExportSchema(schema);
  }

  /** Override of IModelExportHandler.onExportModel */
  protected onExportModel(model: Model, isUpdate: boolean | undefined): void {
    this.writeSectionHeader(`Model: ${model.classFullName}, id=${model.id}, "${model.name}"`);
    const sourceDb = this.iModelExporter.sourceDb;
    // output bis:Element count
    const numElementsSql = `SELECT COUNT(*) FROM ${Element.classFullName} WHERE Model.Id=:modelId`;
    const numElements = sourceDb.withPreparedStatement(numElementsSql, (statement: ECSqlStatement): number => {
      statement.bindId("modelId", model.id);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
    });
    this.writeLine(`${Element.classFullName} (${numElements})`);
    // output more information for bis:GeometricModel
    const geometricElementClassName = model instanceof GeometricModel3d ? GeometricElement3d.classFullName : model instanceof GeometricModel2d ? GeometricElement2d.classFullName : undefined;
    if (undefined !== geometricElementClassName) {
      // output bis:GeometricElement count
      const numGeometricElementsSql = `SELECT COUNT(*) FROM ${geometricElementClassName} WHERE Model.Id=:modelId`;
      const numGeometricElements = sourceDb.withPreparedStatement(numGeometricElementsSql, (statement: ECSqlStatement): number => {
        statement.bindId("modelId", model.id);
        return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
      });
      this.writeLine(`${geometricElementClassName} (${numGeometricElements})`);
      // output GeometryStream count
      const numGeometryStreamsSql = `SELECT COUNT(*) FROM ${geometricElementClassName} WHERE Model.Id=:modelId AND GeometryStream IS NOT NULL`;
      const numGeometryStreams = sourceDb.withPreparedStatement(numGeometryStreamsSql, (statement: ECSqlStatement): number => {
        statement.bindId("modelId", model.id);
        return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getInteger() : 0;
      });
      this.writeLine(`Non-NULL GeometryStreams (${numGeometryStreams})`);
    }
    super.onExportModel(model, isUpdate);
  }

  /** Override of IModelExportHandler.onExportElement */
  protected onExportElement(element: Element, isUpdate: boolean | undefined): void {
    if (!(element instanceof InformationPartitionElement)) {
      const indent = (level: number): string => {
        let indentString = "";
        for (let i = 0; i < level; i++) {
          indentString = `${indentString}  `;
        }
        return indentString;
      };
      if (element.parent?.id) {
        const indentLevel = this._indentMap.get(element.parent.id)! + 1;
        this._indentMap.set(element.id, indentLevel);
        this.writeLine(`${indent(indentLevel)}"${element.getDisplayLabel()}", ${element.classFullName}, id=${element.id}, parentId=${element.parent.id}`);
      } else {
        this._indentMap.set(element.id, 0);
        this.writeLine(`"${element.getDisplayLabel()}", ${element.classFullName}, id=${element.id}`);
      }
    }
    super.onExportElement(element, isUpdate);
  }
}
