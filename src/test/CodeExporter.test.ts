/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as path from "path";
import { Element, IModelDb, IModelExporter, IModelExportHandler, IModelJsFs as fs, SnapshotDb, IModelHost } from "@bentley/imodeljs-backend";
import { CodeExporter } from "../CodeExporter";

describe("CodeExporter", () => {
  before(async () => {
    IModelHost.startup();
  });

  it("exportCodes", () => {
    const outputDirName = path.join(__dirname, "output");
    const outputFileName = path.join(outputDirName, "test.bim.codes.csv");
    if (!fs.existsSync(outputDirName)) {
      fs.mkdirSync(outputDirName);
    }
    const iModelFileName = path.join(__dirname, "snapshot.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "Test" }, createClassViews: true });
    CodeExporter.exportCodes(iModelDb, outputFileName);
    iModelDb.close();
  });
});
