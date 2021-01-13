/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as path from "path";
import { Id64, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { Box, Cone, Point3d, PointString3d, Range3d, StandardViewIndex, Vector3d, YawPitchRollAngles } from "@bentley/geometry-core";
import {
  BackendLoggerCategory, BackendRequestContext, CategorySelector, DefinitionContainer, DisplayStyle3d, ElementOwnsChildElements, IModelDb, IModelHost,
  ModelSelector, OrthographicViewDefinition, PhysicalModel, PhysicalObject, SnapshotDb, SpatialCategory, TemplateModelCloner, TemplateRecipe3d,
} from "@bentley/imodeljs-backend";
import {
  Code, CodeScopeSpec, GeometryStreamBuilder, GeometryStreamProps, IModel, PhysicalElementProps, Placement3d, SubCategoryAppearance,
} from "@bentley/imodeljs-common";
import { TestUtils } from "./TestUtils";

describe("TemplateCloner", () => {
  const loggerCategory = "TemplateClonerTest";

  before(async () => {
    await IModelHost.startup();
    // optionally initialize logging
    if (true) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(BackendLoggerCategory.IModelExporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelImporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelTransformer, LogLevel.Trace);
      Logger.setLevel("test", LogLevel.Trace);
    }
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("export", async () => {
    const iModelFileName = TestUtils.initOutputFile("TemplateCloner.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "TemplateCloner Test" }, createClassViews: true });
    const schemaFilePath = path.join(__dirname, "assets", "ElectricalEquipment.ecschema.xml");
    Logger.logInfo(loggerCategory, `${schemaFilePath}`);
    await iModelDb.importSchemas(new BackendRequestContext(), [schemaFilePath]);
    const definitionManager = new DefinitionManager(iModelDb);
    definitionManager.ensureStandardDefinitions();
    definitionManager.ensureStandardDefinitions(); // call second time to simulate "already inserted" case
    definitionManager.insertSampleComponentDefinitions();
    const physicalModelId = PhysicalModel.insert(iModelDb, IModel.rootSubjectId, "PhysicalModel");
    const physicalModel = iModelDb.models.getModel<PhysicalModel>(physicalModelId, PhysicalModel);
    const equipmentCategoryId = definitionManager.tryGetStandardCategoryId(StandardNames.EquipmentCategory)!;
    const wireCategoryId = definitionManager.tryGetStandardCategoryId(StandardNames.WireCategory)!;
    const genericDeviceTemplateId = definitionManager.tryGetTemplateId("ACME Equipment", "ACME Transformer")!;
    const breakerTemplateId = definitionManager.tryGetTemplateId("ACME Equipment", "ACME Breaker")!;
    assert.isTrue(Id64.isValidId64(equipmentCategoryId));
    assert.isTrue(Id64.isValidId64(wireCategoryId));
    assert.isTrue(Id64.isValidId64(genericDeviceTemplateId));
    assert.isTrue(Id64.isValidId64(breakerTemplateId));
    const cloner = new TemplateModelCloner(iModelDb, iModelDb);
    cloner.context.remapElement(equipmentCategoryId, equipmentCategoryId);
    const genericDeviceLocations = [
      Point3d.create(10, 10), Point3d.create(20, 10), Point3d.create(30, 10),
      Point3d.create(10, 20), Point3d.create(20, 20), Point3d.create(30, 20),
      Point3d.create(10, 30), Point3d.create(20, 30), Point3d.create(30, 30),
    ];
    genericDeviceLocations.forEach((location: Point3d) => {
      const placement = new Placement3d(location, new YawPitchRollAngles(), new Range3d());
      cloner.placeTemplate3d(genericDeviceTemplateId, physicalModelId, placement);
    });
    const breakerLocations = [Point3d.create(-10, 0), Point3d.create(-20, 0), Point3d.create(-30, 0)];
    breakerLocations.forEach((location: Point3d) => {
      const placement = new Placement3d(location, new YawPitchRollAngles(), new Range3d());
      cloner.placeTemplate3d(breakerTemplateId, physicalModelId, placement);
    });
    const projectExtents = new Range3d(-1000, -1000, -1000, 1000, 1000, 1000);
    iModelDb.updateProjectExtents(projectExtents);
    const modelExtents = physicalModel.queryExtents();
    const modelSelectorId = ModelSelector.insert(iModelDb, IModel.dictionaryId, "SpatialModels", [physicalModelId]);
    assert.isTrue(Id64.isValidId64(modelSelectorId));
    const categorySelectorId = CategorySelector.insert(iModelDb, IModel.dictionaryId, "SpatialCategories", [equipmentCategoryId, wireCategoryId]);
    assert.isTrue(Id64.isValidId64(categorySelectorId));
    const displayStyleId: Id64String = DisplayStyle3d.insert(iModelDb, IModel.dictionaryId, "DisplayStyle");
    assert.isTrue(Id64.isValidId64(displayStyleId));
    const viewId = OrthographicViewDefinition.insert(iModelDb, IModel.dictionaryId, "Orthographic View", modelSelectorId, categorySelectorId, displayStyleId, modelExtents, StandardViewIndex.Iso);
    assert.isTrue(Id64.isValidId64(viewId));
    cloner.dispose();
    iModelDb.close();
  });
});

enum StandardNames {
  MyDomain = "MyDomain",
  DefinitionContainerCodeSpec = "MyDomain:DefinitionContainer", // best practice is to use a namespace to ensure CodeSpec uniqueness
  CategoryContainer = "Electrical Equipment Categories",
  EquipmentCategory = "Equipment",
  WireCategory = "Wire",
}

class DefinitionManager {
  private _iModelDb: IModelDb;

  public constructor(iModelDb: IModelDb) {
    this._iModelDb = iModelDb;
  }

  public ensureStandardDefinitions(): void {
    this.ensureStandardCodeSpecs();
    this.ensureStandardCategories();
  }

  public tryGetContainerId(containerName: string): Id64String | undefined {
    return this._iModelDb.elements.queryElementIdByCode(this.createDefinitionContainerCode(containerName));
  }

  public tryGetStandardCategoryId(categoryName: string): Id64String | undefined {
    const containerId = this.tryGetContainerId(StandardNames.CategoryContainer);
    if (undefined === containerId) {
      return undefined;
    }
    return this._iModelDb.elements.queryElementIdByCode(SpatialCategory.createCode(this._iModelDb, containerId, categoryName));
  }

  public tryGetTemplateId(containerName: string, templateName: string): Id64String | undefined {
    const containerId = this._iModelDb.elements.queryElementIdByCode(this.createDefinitionContainerCode(containerName));
    if (undefined === containerId) {
      return undefined;
    }
    return this._iModelDb.elements.queryElementIdByCode(TemplateRecipe3d.createCode(this._iModelDb, containerId, templateName));
  }

  private createDefinitionContainerCode(value: string): Code {
    const codeSpec = this._iModelDb.codeSpecs.getByName(StandardNames.DefinitionContainerCodeSpec);
    return new Code({ spec: codeSpec.id, scope: IModel.rootSubjectId, value });
  }

  private ensureStandardCodeSpecs(): void {
    if (!this._iModelDb.codeSpecs.hasName(StandardNames.DefinitionContainerCodeSpec)) {
      this._iModelDb.codeSpecs.insert(StandardNames.DefinitionContainerCodeSpec, CodeScopeSpec.Type.Repository);
    }
  }

  private ensureStandardCategories(): void {
    const containerCode = this.createDefinitionContainerCode(StandardNames.CategoryContainer);
    let containerId = this._iModelDb.elements.queryElementIdByCode(containerCode);
    if (undefined === containerId) {
      containerId = DefinitionContainer.insert(this._iModelDb, IModel.dictionaryId, containerCode);
    }
    this.ensureStandardCategory(containerId, StandardNames.EquipmentCategory, new SubCategoryAppearance());
    this.ensureStandardCategory(containerId, StandardNames.WireCategory, new SubCategoryAppearance());
  }

  private ensureStandardCategory(containerId: Id64String, categoryName: string, appearance: SubCategoryAppearance): Id64String {
    const categoryId = this._iModelDb.elements.queryElementIdByCode(SpatialCategory.createCode(this._iModelDb, containerId, categoryName));
    return categoryId ?? SpatialCategory.insert(this._iModelDb, containerId, categoryName, appearance);
  }

  public insertSampleComponentDefinitions(): void {
    const componentContainerId = DefinitionContainer.insert(this._iModelDb, IModel.dictionaryId, this.createDefinitionContainerCode("ACME Equipment"));
    const equipmentCategoryId = this.tryGetStandardCategoryId(StandardNames.EquipmentCategory)!;
    // Sample component that is a single element
    const cylinderTemplateId = TemplateRecipe3d.insert(this._iModelDb, componentContainerId, "ACME Transformer");
    const cylinderProps: PhysicalElementProps = {
      classFullName: "ElectricalEquipment:Transformer",
      model: cylinderTemplateId,
      category: equipmentCategoryId,
      code: Code.createEmpty(), // empty in the template, should be set when an instance is placed
      userLabel: "ACME Transformer",
      placement: { origin: Point3d.createZero(), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createCylinderGeom(1),
    };
    this._iModelDb.elements.insertElement(cylinderProps);
    // Sample component that is a parent/child assembly
    const assemblyTemplateId = TemplateRecipe3d.insert(this._iModelDb, componentContainerId, "ACME Breaker");
    const assemblyHeadProps: PhysicalElementProps = {
      classFullName: "ElectricalEquipment:Breaker",
      model: assemblyTemplateId,
      category: equipmentCategoryId,
      code: Code.createEmpty(), // empty in the template, should be set when an instance is placed
      userLabel: "ACME Breaker",
      placement: { origin: Point3d.createZero(), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createBoxGeom(Point3d.create(1, 1, 1)),
    };
    const assemblyHeadId = this._iModelDb.elements.insertElement(assemblyHeadProps);
    // Insert input hook point
    const childElementProps: PhysicalElementProps = {
      classFullName: PhysicalObject.classFullName,
      model: assemblyTemplateId,
      category: equipmentCategoryId,
      parent: new ElementOwnsChildElements(assemblyHeadId),
      code: Code.createEmpty(),
      userLabel: "Input",
      placement: { origin: Point3d.create(0.25, 0.5, 1), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createPointGeom(),
    };
    this._iModelDb.elements.insertElement(childElementProps);
    // Insert output hook point
    childElementProps.userLabel = "Output";
    childElementProps.placement!.origin = Point3d.create(0.75, 0.5, 1);
    this._iModelDb.elements.insertElement(childElementProps);
  }

  private createCylinderGeom(radius: number): GeometryStreamProps {
    const pointA = Point3d.create(0, 0, 0);
    const pointB = Point3d.create(0, 0, 2 * radius);
    const cylinder = Cone.createBaseAndTarget(pointA, pointB, Vector3d.unitX(), Vector3d.unitY(), radius, radius, true);
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(cylinder);
    return builder.geometryStream;
  }

  private createBoxGeom(size: Point3d): GeometryStreamProps {
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(Box.createDgnBox(
      Point3d.createZero(), Vector3d.unitX(), Vector3d.unitY(), new Point3d(0, 0, size.z),
      size.x, size.y, size.x, size.y, true,
    )!);
    return builder.geometryStream;
  }

  private createPointGeom(): GeometryStreamProps {
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(PointString3d.create(Point3d.createZero()));
    return builder.geometryStream;
  }
}
