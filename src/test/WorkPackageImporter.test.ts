/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import { DbResult } from "@itwin/core-bentley";
import { Point3d, Range3d, YawPitchRollAngles } from "@itwin/core-geometry";
import {
  ChannelRootAspect, DefinitionModel, ECSqlStatement, GroupModel, IModelHost, PhysicalElement, PhysicalModel, PhysicalObject,
  SnapshotDb, SpatialCategory, SubCategory, Subject,
} from "@itwin/core-backend";
import { Code, CodeScopeSpec, ColorDef, IModel, PhysicalElementProps, Placement3d, SubCategoryAppearance } from "@itwin/core-common";
import { TestUtils } from "./TestUtils";

describe("WorkPackageImporter", () => {
  before(async () => {
    await IModelHost.startup();
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("should create an iModel and then augment it with work package information", async () => {
    const iModelFileName = TestUtils.initOutputFile("WorkPackaging.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "WorkPackaging Test" }, createClassViews: true });

    // set some arbitrary projectExtents that all SpatialElements should be within
    const projectExtents = new Range3d(-2000, -2000, -500, 2000, 2000, 500);
    iModelDb.updateProjectExtents(projectExtents);

    // import schema utilized by this test
    const schemaFilePath = path.join(__dirname, "assets", "WorkPackaging.ecschema.xml");
    await iModelDb.importSchemas([schemaFilePath]);
    iModelDb.saveChanges("Schema imported");

    // create some sample physical data to simulate what an iModel Connector would normally do
    const pdImporterSubjectId = Subject.insert(iModelDb, IModel.rootSubjectId, "Physical Data");
    ChannelRootAspect.insert(iModelDb, pdImporterSubjectId, "Physical Data");
    const pdPhysicalModelId = PhysicalModel.insert(iModelDb, IModel.rootSubjectId, "PhysicalModel"); // for physical data imported by connector
    const pdDefinitionModelId = DefinitionModel.insert(iModelDb, pdImporterSubjectId, "Physical Data Definitions"); // for definitions imported by connector
    const pdSpatialCategoryId1 = SpatialCategory.insert(iModelDb, pdDefinitionModelId, "SpatialCategory 1", new SubCategoryAppearance({ color: ColorDef.white.tbgr }));
    const pdSpatialCategoryId2 = SpatialCategory.insert(iModelDb, pdDefinitionModelId, "SpatialCategory 2", new SubCategoryAppearance({ color: ColorDef.blue.tbgr }));

    const origins1 = [Point3d.create(10, 10), Point3d.create(20, 10), Point3d.create(30, 10)];
    origins1.forEach((origin: Point3d, index: number) => {
      const physicalElementProps: PhysicalElementProps = {
        classFullName: PhysicalObject.classFullName,
        model: pdPhysicalModelId,
        category: pdSpatialCategoryId1,
        code: Code.createEmpty(),
        userLabel: `Physical1-${index + 1}`,
        placement: new Placement3d(origin, new YawPitchRollAngles(), new Range3d()),
        geom: TestUtils.createCylinderGeom(1),
      };
      iModelDb.elements.insertElement(physicalElementProps);
    });
    const origins2 = [Point3d.create(10, 20), Point3d.create(20, 20), Point3d.create(30, 20)];
    origins2.forEach((origin: Point3d, index: number) => {
      const physicalElementProps: PhysicalElementProps = {
        classFullName: PhysicalObject.classFullName,
        model: pdPhysicalModelId,
        category: pdSpatialCategoryId2,
        code: Code.createEmpty(),
        userLabel: `Physical2-${index + 1}`,
        placement: new Placement3d(origin, new YawPitchRollAngles(), new Range3d()),
        geom: TestUtils.createBoxGeom(Point3d.create(2, 2, 2)),
      };
      iModelDb.elements.insertElement(physicalElementProps);
    });
    iModelDb.saveChanges("Physical data imported");

    // augment the iModel with work packaging information
    const wpImporterSubjectId = Subject.insert(iModelDb, IModel.rootSubjectId, "Work Package Data");
    ChannelRootAspect.insert(iModelDb, wpImporterSubjectId, "Work Package Data");
    const wpDefinitionModelId = DefinitionModel.insert(iModelDb, wpImporterSubjectId, "Work Package Definitions");
    const wpCategoryId = SpatialCategory.insert(iModelDb, wpDefinitionModelId, "Work Package Appearances", new SubCategoryAppearance());
    const wpAppearanceId1 = SubCategory.insert(iModelDb, wpCategoryId, "Appearance 1", { color: ColorDef.red.tbgr });
    const wpAppearanceId2 = SubCategory.insert(iModelDb, wpCategoryId, "Appearance 2", { color: ColorDef.green.tbgr });

    const wpCodeSpecId = iModelDb.codeSpecs.insert("Work Package Names", CodeScopeSpec.Type.Model);
    const wpModelId = GroupModel.insert(iModelDb, wpImporterSubjectId, "Work Packages");

    // insert WorkPackage1
    const workPackageProps1 = {
      classFullName: "WorkPackaging:WorkPackage",
      model: wpModelId,
      code: { spec: wpCodeSpecId, scope: wpModelId, value: "CWP1" },
      workPackageType: "CWP",
      appearance: { id: wpAppearanceId1 },
    };
    const workPackageId1 = iModelDb.elements.insertElement(workPackageProps1);

    // insert WorkPackage2
    const workPackageProps2 = {
      classFullName: "WorkPackaging:WorkPackage",
      model: wpModelId,
      code: { spec: wpCodeSpecId, scope: wpModelId, value: "CWP2" },
      workPackageType: "CWP",
      appearance: { id: wpAppearanceId2 },
    };
    const workPackageId2 = iModelDb.elements.insertElement(workPackageProps2);

    // this sample code groups PhysicalElements by category, but a real app would use other criteria
    const sql = `SELECT ECInstanceId FROM ${PhysicalElement.classFullName} WHERE Category.Id=:categoryId`;

    // workPackage1 groups PhysicalElements in SpatialCategory1
    iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement) => {
      statement.bindId("categoryId", pdSpatialCategoryId1);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const physicalElementId = statement.getValue(0).getId();
        iModelDb.relationships.insertInstance({
          classFullName: "WorkPackaging:WorkPackageGroupsElements",
          sourceId: workPackageId1,
          targetId: physicalElementId,
        });
      }
    });

    // workPackage2 groups PhysicalElements in SpatialCategory2
    iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement) => {
      statement.bindId("categoryId", pdSpatialCategoryId2);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const physicalElementId = statement.getValue(0).getId();
        iModelDb.relationships.insertInstance({
          classFullName: "WorkPackaging:WorkPackageGroupsElements",
          sourceId: workPackageId2,
          targetId: physicalElementId,
        });
      }
    });

    iModelDb.close();
  });
});
