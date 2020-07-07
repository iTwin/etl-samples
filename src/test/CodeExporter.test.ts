/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { IModelHost, IModelJsFs as fs, SnapshotDb } from "@bentley/imodeljs-backend";
import { CodeExporter } from "../CodeExporter";

describe("CodeExporter", () => {
  before(async () => {
    IModelHost.startup();
  });

  after(async () => {
    IModelHost.shutdown();
  });

  it("exportCodes", () => {
    const outputDirName = path.join(__dirname, "output");
    const outputFileName = path.join(outputDirName, "test.bim.codes.csv");
    if (!fs.existsSync(outputDirName)) {
      fs.mkdirSync(outputDirName);
    }
    const iModelFileName = path.join(__dirname, "snapshot.bim");
    if (fs.existsSync(iModelFileName)) {
      fs.removeSync(iModelFileName);
    }
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "Test" }, createClassViews: true });
    CodeExporter.exportCodes(iModelDb, outputFileName);
    iModelDb.close();
  });
});
