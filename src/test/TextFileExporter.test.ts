/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb, SpatialCategory } from "@bentley/imodeljs-backend";
import { TextFileExporter } from "../TextFileExporter";
import { TestUtils } from "./TestUtils";
import { IModel } from "@bentley/imodeljs-common";

describe("TextFileExporter", () => {
  before(async () => {
    await IModelHost.startup();
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("export", () => {
    const outputFileName = TestUtils.initOutputFile("test.bim.txt");
    const iModelFileName = TestUtils.initOutputFile("test.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "Test" }, createClassViews: true });
    SpatialCategory.insert(iModelDb, IModel.dictionaryId, "SpatialCategory1", {});
    SpatialCategory.insert(iModelDb, IModel.dictionaryId, "SpatialCategory2", {});
    TextFileExporter.export(iModelDb, outputFileName);
    iModelDb.close();
  });
});
