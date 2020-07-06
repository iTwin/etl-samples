/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Element, IModelDb, IModelExporter, IModelExportHandler, IModelJsFs as fs } from "@bentley/imodeljs-backend";
import { CodeSpec } from "@bentley/imodeljs-common";

/** CodeExporter creates a CSV output file containing all Codes from the specified iModel. */
export class CodeExporter extends IModelExportHandler {
  public outputFileName: string;

  /** Initiate the export of codes. */
  public static exportCodes(iModelDb: IModelDb, outputFileName: string): void {
    const exporter = new IModelExporter(iModelDb);
    const exportHandler = new CodeExporter(outputFileName);
    exporter.registerHandler(exportHandler);
    exporter.exportAll();
  }

  /** Construct a new CodeExporter */
  private constructor(outputFileName: string) {
    super();
    if (fs.existsSync(outputFileName)) {
      fs.removeSync(outputFileName);
    }
    this.outputFileName = outputFileName;
  }

  /** Override of IModelExportHandler.onExportElement that outputs a line of a CSV file when the Element has a Code. */
  protected onExportElement(element: Element, isUpdate: boolean | undefined): void {
    const codeValue: string = element.code.getValue();
    if ("" !== codeValue) { // only output when Element has a Code
      const codeSpec: CodeSpec = element.iModel.codeSpecs.getById(element.code.spec);
      fs.appendFileSync(this.outputFileName, `${element.id}, ${codeSpec.name}, ${codeValue}\n`);
    }
    super.onExportElement(element, isUpdate);
  }
}
