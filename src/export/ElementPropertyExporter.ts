/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  ECSqlStatement, Element, GeometricElement3d, IModelDb, IModelExporter, IModelExportHandler, IModelJsFs, SpatialCategory,
} from "@bentley/imodeljs-backend";
import { Code, DbResult } from "@bentley/imodeljs-common";

/** ElementPropertyExporter creates a JSON output file that captures, on a per Element basis, each Element's direct properties and some related properties. */
export class ElementPropertyExporter extends IModelExportHandler {
  public outputFileName: string;
  public iModelExporter: IModelExporter;

  /** Initiate the export of codes. */
  public static export(iModelDb: IModelDb, outputFileName: string): void {
    const handler = new ElementPropertyExporter(iModelDb, outputFileName);
    handler.writeFileHeader();
    handler.iModelExporter.exportAll();
    handler.writeFileFooter();
  }

  /** Construct a new ElementPropertyExporter */
  private constructor(sourceDb: IModelDb, outputFileName: string) {
    super();
    if (IModelJsFs.existsSync(outputFileName)) {
      IModelJsFs.removeSync(outputFileName);
    }
    this.outputFileName = outputFileName;
    this.iModelExporter = new IModelExporter(sourceDb);
    this.iModelExporter.registerHandler(this);
    this.iModelExporter.visitElements = true;
    this.iModelExporter.visitRelationships = false;
    this.iModelExporter.wantGeometry = false;
    this.iModelExporter.wantTemplateModels = false;
  }

  /** Override of IModelExportHandler.onExportElement that outputs an export object per Element. */
  protected onExportElement(element: Element, isUpdate: boolean | undefined): void {
    if (element instanceof GeometricElement3d) { // only want to export physical elements and spatial locations
      this.writeExportProps(this.buildExportProps(element));
    }
    super.onExportElement(element, isUpdate); // call super to continue export
  }

  /** Build an export object from the specified element.
   * @note This shows how you can use the power of JavaScript to create a custom export object
   */
  private buildExportProps(element: GeometricElement3d): object {
    const iModelDb = element.iModel;

    // Get export props for the Element
    const exportElementProps: any = element.toJSON();
    exportElementProps.codeValue = Code.isEmpty(element.code) ? undefined : element.code.getValue(); // only want codeValue in the export props
    exportElementProps.code = undefined; // remove the standard Code object from the export props
    exportElementProps.placement = undefined; // this example doesn't care about the GeometricElement3d's placement, so removes it from the export props
    exportElementProps.categoryName = iModelDb.elements.getElement<SpatialCategory>(element.category).code.getValue(); // add categoryName into export props

    // Get export props for the ElementAspects that are owned by this Element
    const exportAspectProps = [];
    for (const elementAspect of iModelDb.elements.getAspects(element.id)) {
      const exportProps: any = elementAspect.toJSON(); // start with the standard ElementAspectProps
      exportProps.element = undefined; // don't need Element information here since it is captured by exportElementProps
      exportProps.id = undefined; // don't need the ElementAspects id, the Element's id suffices
      exportAspectProps.push(exportProps);
    }

    // If present, get props for the TypeDefinition related to this Element
    const typeDefinitionProps = element.typeDefinition ? iModelDb.elements.tryGetElementProps(element.typeDefinition.id) : undefined;

    // Example of following a relationship
    const functionalSql = "SELECT TargetECInstanceId FROM Functional:PhysicalElementFulfillsFunction WHERE SourceECInstanceId=:sourceId";
    const functionalProps = iModelDb.withPreparedStatement(functionalSql, (statement: ECSqlStatement) => {
      const exportProps = [];
      statement.bindId("sourceId", element.id);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const targetId = statement.getValue(0).getId();
        exportProps.push(iModelDb.elements.tryGetElementProps(targetId));
      }
      return exportProps.length > 0 ? exportProps : undefined;
    });

    // ... Follow other relationship here ...

    return {
      element: exportElementProps,
      elementAspects: exportAspectProps,
      typeDefinition: typeDefinitionProps,
      functional: functionalProps,
      // ... Add other related props here ...
    };
  }

  /** Write output file header. */
  private writeFileHeader(): void {
    IModelJsFs.appendFileSync(this.outputFileName, "[");
  }

  /** Write output file footer. */
  private writeFileFooter(): void {
    IModelJsFs.appendFileSync(this.outputFileName, "\n]\n");
  }

  private writeExportProps(props: object): void {
    if (this._writeLineCalled) {
      IModelJsFs.appendFileSync(this.outputFileName, ",\n");
    } else {
      IModelJsFs.appendFileSync(this.outputFileName, "\n");
    }
    IModelJsFs.appendFileSync(this.outputFileName, JSON.stringify(props));
    this._writeLineCalled = true;
  }
  private _writeLineCalled = false;
}
