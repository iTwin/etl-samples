/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb, SpatialCategory } from "@bentley/imodeljs-backend";
import { CodeExporter } from "../CodeExporter";
import { TestUtils } from "./TestUtils";
import { IModel } from "@bentley/imodeljs-common";

describe("CodeExporter", () => {
  before(async () => {
    IModelHost.startup();
  });

  after(async () => {
    IModelHost.shutdown();
  });

  it("exportCodes", () => {
    const outputFileName = TestUtils.initOutputFile("test.bim.codes.csv");
    const iModelFileName = TestUtils.initOutputFile("test.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "Test" }, createClassViews: true });
    SpatialCategory.insert(iModelDb, IModel.dictionaryId, "SpatialCategory1", {});
    SpatialCategory.insert(iModelDb, IModel.dictionaryId, "SpatialCategory2", {});
    CodeExporter.exportCodes(iModelDb, outputFileName);
    iModelDb.close();
  });
});
