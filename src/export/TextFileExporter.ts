/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Schema } from "@itwin/ecschema-metadata";
import {
  Element, ElementMultiAspect, ElementUniqueAspect, IModelDb, IModelJsFs, Model, Relationship,
} from "@itwin/core-backend";
import { IModelExporter, IModelExportHandler } from "@itwin/core-transformer";
import { CodeSpec, FontProps } from "@itwin/core-common";

/** Exports a text summary of the iModel contents to an output text file. */
export class TextFileExporter extends IModelExportHandler {
  public outputFileName: string;
  public iModelExporter: IModelExporter;
  private _firstFont: boolean = true;
  private _firstRelationship: boolean = true;

  /** Construct a new TextFileExporter */
  public constructor(sourceDb: IModelDb, outputFileName: string) {
    super();
    if (IModelJsFs.existsSync(outputFileName)) {
      IModelJsFs.removeSync(outputFileName);
    }
    this.outputFileName = outputFileName;
    this.iModelExporter = new IModelExporter(sourceDb);
    this.iModelExporter.registerHandler(this);
    this.iModelExporter.wantGeometry = false;
  }

  /** Initiate the export */
  public static async export(iModelDb: IModelDb, outputFileName: string): Promise<void> {
    const handler = new TextFileExporter(iModelDb, outputFileName);
    await handler.iModelExporter.exportSchemas();
    handler.writeSeparator();
    await handler.iModelExporter.exportAll();
  }

  /** Write a line to the output file. */
  private writeLine(line: string): void {
    IModelJsFs.appendFileSync(this.outputFileName, line);
    IModelJsFs.appendFileSync(this.outputFileName, "\n");
  }

  /** Write a separator line to the output file */
  private writeSeparator(): void {
    IModelJsFs.appendFileSync(this.outputFileName, "--------------------------------\n");
  }

  /** Override of IModelExportHandler.onExportSchema */
  public override async onExportSchema(schema: Schema): Promise<void> {
    this.writeLine(`[Schema] ${schema.name}`);
    await super.onExportSchema(schema);
  }

  /** Override of IModelExportHandler.onExportCodeSpec */
  public override onExportCodeSpec(codeSpec: CodeSpec, isUpdate: boolean | undefined): void {
    this.writeLine(`[CodeSpec] codeSpecId=${codeSpec.id}, "${codeSpec.name}"`);
    super.onExportCodeSpec(codeSpec, isUpdate);
  }

  /** Override of IModelExportHandler.onExportFont */
  public override onExportFont(font: FontProps, isUpdate: boolean | undefined): void {
    if (this._firstFont) {
      this.writeSeparator();
      this._firstFont = false;
    }
    this.writeLine(`[Font] fontId=${font.id}, "${font.name}"`);
    super.onExportFont(font, isUpdate);
  }

  /** Override of IModelExportHandler.onExportModel */
  public override onExportModel(model: Model, isUpdate: boolean | undefined): void {
    this.writeSeparator();
    this.writeLine(`[Model] ${model.classFullName}, id=${model.id}, "${model.name}"`);
    super.onExportModel(model, isUpdate);
  }

  /** Override of IModelExportHandler.onExportElement */
  public override onExportElement(element: Element, isUpdate: boolean | undefined): void {
    const parentString = element.parent?.id ? `, parentId=${element.parent.id}` : "";
    this.writeLine(`[Element] ${element.classFullName}, id=${element.id}${parentString}, "${element.getDisplayLabel()}"`);
    super.onExportElement(element, isUpdate);
  }

  /** Override of IModelExportHandler.onExportElementUniqueAspect */
  public override onExportElementUniqueAspect(aspect: ElementUniqueAspect, isUpdate: boolean | undefined): void {
    this.writeLine(`[Aspect] ${aspect.classFullName}, id=${aspect.id}, elementId=${aspect.element.id}`);
    super.onExportElementUniqueAspect(aspect, isUpdate);
  }

  /** Override of IModelExportHandler.onExportElementMultiAspects */
  public override onExportElementMultiAspects(aspects: ElementMultiAspect[]): void {
    for (const aspect of aspects) {
      this.writeLine(`[Aspect] ${aspect.classFullName}, id=${aspect.id}, elementId=${aspect.element.id}`);
    }
    super.onExportElementMultiAspects(aspects);
  }

  /** Override of IModelExportHandler.onExportRelationship */
  public override onExportRelationship(relationship: Relationship, isUpdate: boolean | undefined): void {
    if (this._firstRelationship) {
      this.writeSeparator();
      this._firstRelationship = false;
    }
    this.writeLine(`[Relationship] ${relationship.classFullName}, id=${relationship.id}, sourceId=${relationship.sourceId}, targetId=${relationship.targetId}`);
    super.onExportRelationship(relationship, isUpdate);
  }
}
