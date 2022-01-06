/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as path from "path";
import { DbResult, Id64, Id64Array, Id64String, Logger, LogLevel } from "@itwin/core-bentley";
import { Point2d, Point3d, Range3d, StandardViewIndex, YawPitchRollAngles } from "@itwin/core-geometry";
import {
  CategorySelector, DefinitionContainer, DefinitionElement, DefinitionModel, DisplayStyle3d,
  DocumentListModel, Drawing, DrawingCategory, DrawingGraphic, DrawingModel, ECSqlStatement, ElementOwnsChildElements, FunctionalModel,
  FunctionalSchema, IModelDb, IModelHost, ModelSelector, OrthographicViewDefinition, PhysicalElement, PhysicalElementFulfillsFunction, PhysicalModel,
  SnapshotDb, SpatialCategory, SpatialLocation, TemplateRecipe2d, TemplateRecipe3d,
} from "@itwin/core-backend";
import { TransformerLoggerCategory, TemplateModelCloner } from "@itwin/core-transformer";
import {
  BisCodeSpec, Code, CodeScopeSpec, DefinitionElementProps, GeometricElement2dProps, GeometricElement3dProps, GeometricModel2dProps, IModel,
  PhysicalElementProps, Placement3d, SubCategoryAppearance,
} from "@itwin/core-common";
import { TestUtils } from "./TestUtils";

const loggerCategory = "TemplateClonerTest";

describe("TemplateCloner", () => {
  before(async () => {
    await IModelHost.startup();
    // optionally initialize logging
    if (false) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(TransformerLoggerCategory.IModelExporter, LogLevel.Trace);
      Logger.setLevel(TransformerLoggerCategory.IModelImporter, LogLevel.Trace);
      Logger.setLevel(TransformerLoggerCategory.IModelTransformer, LogLevel.Trace);
      Logger.setLevel(loggerCategory, LogLevel.Trace);
    }
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("should populate an iModel with template definitions and cloned instances", async () => {
    const iModelFileName = TestUtils.initOutputFile("TemplateCloner.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "TemplateCloner Test" }, createClassViews: true });
    const projectExtents = new Range3d(-2000, -2000, -500, 2000, 2000, 500); // set some arbitrary projectExtents that all SpatialElements should be within
    iModelDb.updateProjectExtents(projectExtents);
    const schemaFilePath = path.join(__dirname, "assets", "ElectricalEquipment.ecschema.xml");
    Logger.logInfo(loggerCategory, `${schemaFilePath}`);
    await iModelDb.importSchemas([FunctionalSchema.schemaFilePath, schemaFilePath]);
    const definitionManager = new StandardDefinitionManager(iModelDb);
    definitionManager.ensureStandardDefinitions();
    const equipmentCategoryId = definitionManager.tryGetSpatialCategoryId(SpatialCategoryName.Equipment)!;
    const wireCategoryId = definitionManager.tryGetSpatialCategoryId(SpatialCategoryName.Wire)!;
    assert.isTrue(Id64.isValidId64(equipmentCategoryId));
    assert.isTrue(Id64.isValidId64(wireCategoryId));
    definitionManager.ensureStandardDefinitions(); // call second time to simulate "already inserted" case
    const equipmentDefinitionCreator = new SampleEquipmentDefinitionCreator(definitionManager);
    equipmentDefinitionCreator.insertSampleComponentDefinitions();
    const physicalModelId = PhysicalModel.insert(iModelDb, IModel.rootSubjectId, "PhysicalModel");
    const physicalModel = iModelDb.models.getModel<PhysicalModel>(physicalModelId, PhysicalModel);
    const functionalModelId = FunctionalModel.insert(iModelDb, IModel.rootSubjectId, "FunctionalModel");
    const documentListModelId = DocumentListModel.insert(iModelDb, IModel.rootSubjectId, "Drawings");
    const drawingId = Drawing.insert(iModelDb, documentListModelId, "Drawing");
    const transformerDefinitionId = definitionManager.tryGetEquipmentDefinitionId("ACME Equipment", "ACME Transformer")!;
    const breakerDefinitionId = definitionManager.tryGetEquipmentDefinitionId("ACME Equipment", "ACME Breaker")!;
    assert.isTrue(Id64.isValidId64(transformerDefinitionId));
    assert.isTrue(Id64.isValidId64(breakerDefinitionId));
    const placer = new EquipmentPlacer(definitionManager, physicalModelId, functionalModelId, drawingId);
    const transformerOrigins = [
      Point3d.create(10, 10), Point3d.create(20, 10), Point3d.create(30, 10),
      Point3d.create(10, 20), Point3d.create(20, 20), Point3d.create(30, 20),
      Point3d.create(10, 30), Point3d.create(20, 30), Point3d.create(30, 30),
    ];
    await Promise.all(transformerOrigins.map(async (origin: Point3d, index: number) => {
      const placement = new Placement3d(origin, new YawPitchRollAngles(), new Range3d());
      await placer.placeEquipmentInstance(transformerDefinitionId, placement, `T-${index + 1}`);
    }));
    const breakerOrigins = [Point3d.create(-10, 0), Point3d.create(-20, 0), Point3d.create(-30, 0)];
    await Promise.all(breakerOrigins.map(async (origin: Point3d, index: number) => {
      const placement = new Placement3d(origin, new YawPitchRollAngles(), new Range3d());
      await placer.placeEquipmentInstance(breakerDefinitionId, placement, `B-${index + 1}`);
    }));
    const modelExtents = physicalModel.queryExtents();
    const modelSelectorId = ModelSelector.insert(iModelDb, IModel.dictionaryId, "SpatialModels", [physicalModelId]);
    assert.isTrue(Id64.isValidId64(modelSelectorId));
    const categorySelectorId = CategorySelector.insert(iModelDb, IModel.dictionaryId, "SpatialCategories", [equipmentCategoryId, wireCategoryId]);
    assert.isTrue(Id64.isValidId64(categorySelectorId));
    const displayStyleId: Id64String = DisplayStyle3d.insert(iModelDb, IModel.dictionaryId, "DisplayStyle");
    assert.isTrue(Id64.isValidId64(displayStyleId));
    const viewId = OrthographicViewDefinition.insert(iModelDb, IModel.dictionaryId, "Orthographic View", modelSelectorId, categorySelectorId, displayStyleId, modelExtents, StandardViewIndex.Iso);
    assert.isTrue(Id64.isValidId64(viewId));
    placer.dispose();
    iModelDb.close();
  });

  it.skip("should create template views", async () => {
    const seedFileName = "d:/data/bim/electricalcatalog.bim";
    const seedDb = SnapshotDb.openFile(seedFileName);
    const iModelFileName = TestUtils.initOutputFile("template-views.bim");
    const iModelDb = SnapshotDb.createFrom(seedDb, iModelFileName);
    seedDb.close();
    const projectExtents = new Range3d(-2000, -2000, -500, 2000, 2000, 500); // set some arbitrary projectExtents that all SpatialElements should be within
    iModelDb.updateProjectExtents(projectExtents);
    const getInstanceIds = (elementClassFullName: string): Id64Array => {
      return iModelDb.withPreparedStatement(`SELECT ECInstanceId FROM ${elementClassFullName}`, (statement: ECSqlStatement) => {
        Logger.logInfo(loggerCategory, `=== ${elementClassFullName} ===`);
        const elementIds: Id64Array = [];
        while (DbResult.BE_SQLITE_ROW === statement.step()) {
          const elementId = statement.getValue(0).getId();
          const element = iModelDb.elements.getElement(elementId);
          Logger.logInfo(loggerCategory, `${elementId} - ${element.getDisplayLabel()}`);
          elementIds.push(elementId);
        }
        return elementIds;
      });
    };
    const definitionModelId = DefinitionModel.insert(iModelDb, IModel.rootSubjectId, "Template Views");
    const categoryIds = getInstanceIds(SpatialCategory.classFullName);
    const categorySelectorId = CategorySelector.insert(iModelDb, definitionModelId, "All Spatial Categories", categoryIds);
    const displayStyleId = DisplayStyle3d.insert(iModelDb, definitionModelId, "Template Views Display Style");
    const templateIds = getInstanceIds(TemplateRecipe3d.classFullName);
    const cloner = new TemplateModelCloner(iModelDb, iModelDb);
    categoryIds.forEach((categoryId: Id64String) => {
      cloner.context.remapElement(categoryId, categoryId); // map category of definition to category of instance - in this case the same
    });
    templateIds.forEach((templateId: Id64String) => {
      const template = iModelDb.elements.getElement<TemplateRecipe3d>(templateId, TemplateRecipe3d);
      const templateName = template.code.value;
      const physicalModelId = PhysicalModel.insert(iModelDb, IModel.rootSubjectId, templateName);
      const physicalModel = iModelDb.models.getModel<PhysicalModel>(physicalModelId, PhysicalModel);
      const modelSelectorId = ModelSelector.insert(iModelDb, definitionModelId, templateName, [physicalModelId]);
      cloner.placeTemplate3d(template.id, physicalModelId, new Placement3d(Point3d.createZero(), new YawPitchRollAngles(), Range3d.createNull()));
      const modelExtents = physicalModel.queryExtents();
      OrthographicViewDefinition.insert(iModelDb, definitionModelId, templateName, modelSelectorId, categorySelectorId, displayStyleId, modelExtents, StandardViewIndex.Iso);
    });
    iModelDb.close();
  });
});

/** Enum containing the names of the standard CodeSpec created by this domain.
 * @note It is a best practice is to use a namespace to ensure CodeSpec uniqueness.
 */
enum CodeSpecName {
  DefinitionContainer = "ElectricalEquipment:DefinitionContainer",
  Equipment = "ElectricalEquipment:Equipment",
  EquipmentDefinition = "ElectricalEquipment:EquipmentDefinition",
  FunctionalEquipment = "ElectricalEquipment:FunctionalEquipment",
}

/** Enum containing the names of the standard SpatialCategory elements created by this domain.
 * SpatialCategories are specific to 3d.
 * @note These names are scoped to a specific DefinitionContainer to ensure uniqueness across domains.
 */
enum SpatialCategoryName {
  Equipment = "Equipment", // for Equipment in a PhysicalModel
  Wire = "Wire", // for Wire in a PhysicalModel
}

/** Enum containing the names of the standard DrawingCategory elements created by this domain.
 * DrawingCategories are specific to 2d.
 * @note These names are scoped to a specific DefinitionContainer to ensure uniqueness across domains.
 */
enum DrawingCategoryName {
  Notes = "Notes",
  TitleBlock = "TitleBlock",
  Equipment = "Equipment", // for Equipment in a 2d schematic DrawingModel
  Wire = "Wire", // for Wire in a 2d schematic DrawingModel
}

enum DefinitionContainerName {
  Categories = "Electrical Equipment Categories",
}

/** Manages the CodeSpecs, categories, and other standard definitions that are always present and required. */
class StandardDefinitionManager {
  public readonly iModelDb: IModelDb;

  public constructor(iModelDb: IModelDb) {
    this.iModelDb = iModelDb;
  }

  public ensureStandardDefinitions(): void {
    this.ensureStandardCodeSpecs();
    this.ensureStandardCategories();
  }

  public tryGetContainerId(containerName: string): Id64String | undefined {
    return this.iModelDb.elements.queryElementIdByCode(this.createDefinitionContainerCode(containerName));
  }

  public tryGetSpatialCategoryId(categoryName: string): Id64String | undefined {
    const containerId = this.tryGetContainerId(DefinitionContainerName.Categories);
    if (undefined === containerId) {
      return undefined;
    }
    return this.iModelDb.elements.queryElementIdByCode(SpatialCategory.createCode(this.iModelDb, containerId, categoryName));
  }

  public tryGetDrawingCategoryId(categoryName: string): Id64String | undefined {
    const containerId = this.tryGetContainerId(DefinitionContainerName.Categories);
    if (undefined === containerId) {
      return undefined;
    }
    return this.iModelDb.elements.queryElementIdByCode(DrawingCategory.createCode(this.iModelDb, containerId, categoryName));
  }

  public tryGetEquipmentDefinitionId(containerName: string, definitionName: string): Id64String | undefined {
    const containerId = this.iModelDb.elements.queryElementIdByCode(this.createDefinitionContainerCode(containerName));
    if (undefined === containerId) {
      return undefined;
    }
    return this.iModelDb.elements.queryElementIdByCode(this.createEquipmentDefinitionCode(containerId, definitionName));
  }

  private ensureStandardCodeSpecs(): void {
    // insert a CodeSpec to enforce unique names for DefinitionContainers
    if (!this.iModelDb.codeSpecs.hasName(CodeSpecName.DefinitionContainer)) {
      this.iModelDb.codeSpecs.insert(CodeSpecName.DefinitionContainer, CodeScopeSpec.Type.Repository); // CodeValues must be unique within entire repository/iModel
    }
    // insert a CodeSpec to enforce unique names for EquipmentDefinitions
    if (!this.iModelDb.codeSpecs.hasName(CodeSpecName.EquipmentDefinition)) {
      this.iModelDb.codeSpecs.insert(CodeSpecName.EquipmentDefinition, CodeScopeSpec.Type.Model); // CodeValues must be unique within a specific Model
    }
    // insert a CodeSpec to enforce unique names for Equipment
    if (!this.iModelDb.codeSpecs.hasName(CodeSpecName.Equipment)) {
      this.iModelDb.codeSpecs.insert(CodeSpecName.Equipment, CodeScopeSpec.Type.Repository); // CodeValues must be unique within entire repository/iModel
    }
    // insert a CodeSpec to enforce unique names for FunctionalEquipment
    if (!this.iModelDb.codeSpecs.hasName(CodeSpecName.FunctionalEquipment)) {
      this.iModelDb.codeSpecs.insert(CodeSpecName.FunctionalEquipment, CodeScopeSpec.Type.Repository); // CodeValues must be unique within entire repository/iModel
    }
  }

  public createDefinitionContainerCode(value: string): Code {
    const codeSpec = this.iModelDb.codeSpecs.getByName(CodeSpecName.DefinitionContainer);
    return new Code({ spec: codeSpec.id, scope: IModel.rootSubjectId, value }); // scope is root subject for CodeScopeSpec.Type.Repository
  }

  public createEquipmentDefinitionCode(containerId: Id64String, value: string): Code {
    const codeSpec = this.iModelDb.codeSpecs.getByName(CodeSpecName.EquipmentDefinition);
    return new Code({ spec: codeSpec.id, scope: containerId, value }); // scope is container for CodeScopeSpec.Type.Model
  }

  public createEquipmentCode(value: string): Code {
    const codeSpec = this.iModelDb.codeSpecs.getByName(CodeSpecName.Equipment);
    return new Code({ spec: codeSpec.id, scope: IModel.rootSubjectId, value }); // scope is root subject for CodeScopeSpec.Type.Repository
  }

  public createFunctionalEquipmentCode(value: string): Code {
    const codeSpec = this.iModelDb.codeSpecs.getByName(CodeSpecName.FunctionalEquipment);
    return new Code({ spec: codeSpec.id, scope: IModel.rootSubjectId, value }); // scope is root subject for CodeScopeSpec.Type.Repository
  }

  private ensureStandardCategories(): void {
    // the DefinitionContainer for all categories
    const containerCode = this.createDefinitionContainerCode(DefinitionContainerName.Categories);
    let containerId = this.iModelDb.elements.queryElementIdByCode(containerCode);
    if (undefined === containerId) {
      containerId = DefinitionContainer.insert(this.iModelDb, IModel.dictionaryId, containerCode);
    }
    // the standard SpatialCategories
    this.ensureSpatialCategory(containerId, SpatialCategoryName.Equipment, new SubCategoryAppearance());
    this.ensureSpatialCategory(containerId, SpatialCategoryName.Wire, new SubCategoryAppearance());
    // the standard DrawingCategories
    this.ensureDrawingCategory(containerId, DrawingCategoryName.Notes, new SubCategoryAppearance());
    this.ensureDrawingCategory(containerId, DrawingCategoryName.TitleBlock, new SubCategoryAppearance());
    this.ensureDrawingCategory(containerId, DrawingCategoryName.Equipment, new SubCategoryAppearance());
    this.ensureDrawingCategory(containerId, DrawingCategoryName.Wire, new SubCategoryAppearance());
  }

  private ensureSpatialCategory(containerId: Id64String, categoryName: string, appearance: SubCategoryAppearance): Id64String {
    const categoryId = this.iModelDb.elements.queryElementIdByCode(SpatialCategory.createCode(this.iModelDb, containerId, categoryName));
    return categoryId ?? SpatialCategory.insert(this.iModelDb, containerId, categoryName, appearance);
  }

  private ensureDrawingCategory(containerId: Id64String, categoryName: string, appearance: SubCategoryAppearance): Id64String {
    const categoryId = this.iModelDb.elements.queryElementIdByCode(DrawingCategory.createCode(this.iModelDb, containerId, categoryName));
    return categoryId ?? DrawingCategory.insert(this.iModelDb, containerId, categoryName, appearance);
  }

  /** Insert a TemplateRecipe2d and its sub-DrawingModel
   * @note Should use TemplateRecipe2d.insert when it is added to @bentley/imodeljs-backend
   */
  public insertTemplateRecipe2d(containerId: Id64String, recipeName: string): Id64String {
    const codeSpec = this.iModelDb.codeSpecs.getByName(BisCodeSpec.templateRecipe2d);
    const code = new Code({ spec: codeSpec.id, scope: containerId, value: recipeName });
    const elementProps: DefinitionElementProps = {
      classFullName: TemplateRecipe2d.classFullName,
      model: containerId,
      code,
    };
    const templateRecipe = new TemplateRecipe2d(elementProps, this.iModelDb);
    const templateRecipeId = this.iModelDb.elements.insertElement(templateRecipe);
    const modelProps: GeometricModel2dProps = {
      classFullName: DrawingModel.classFullName,
      modeledElement: { id: templateRecipeId },
      isTemplate: true,
    };
    return this.iModelDb.models.insertModel(modelProps);
  }
}

/** Conceptually the same as an EquipmentDefinition importer except it creates hard-coded sample data. */
class SampleEquipmentDefinitionCreator {
  private _definitionManager: StandardDefinitionManager;
  public constructor(definitionManager: StandardDefinitionManager) {
    this._definitionManager = definitionManager;
  }
  /** Create sample EquipmentDefinitions */
  public insertSampleComponentDefinitions(): void {
    const manager = this._definitionManager;
    const iModelDb = manager.iModelDb;
    const containerId = DefinitionContainer.insert(iModelDb, IModel.dictionaryId, manager.createDefinitionContainerCode("ACME Equipment"));
    const equipmentSpatialCategoryId = manager.tryGetSpatialCategoryId(SpatialCategoryName.Equipment)!;
    const equipmentDrawingCategoryId = manager.tryGetDrawingCategoryId(DrawingCategoryName.Equipment)!;

    // ACME Transformer - EquipmentDefinition
    const transformerDefinitionId = iModelDb.elements.insertElement({
      classFullName: "ElectricalEquipment:EquipmentDefinition",
      model: containerId,
      code: manager.createEquipmentDefinitionCode(containerId, "ACME Transformer"),
      jsonProperties: { equipmentParams: { functionalClassFullName: "ElectricalEquipment:TransformerFunction" } },
    });
    // ACME Transformer - Physical Template
    const transformerPhysicalTemplateId = TemplateRecipe3d.insert(iModelDb, containerId, "ACME Transformer"); // this inserts the TemplateRecipe3d element and its sub-model
    const transformerPhysicalProps: PhysicalElementProps = {
      classFullName: "ElectricalEquipment:Transformer",
      model: transformerPhysicalTemplateId,
      category: equipmentSpatialCategoryId,
      code: Code.createEmpty(), // empty in the template, should be set when an instance is placed
      userLabel: "ACME Transformer",
      placement: { origin: Point3d.createZero(), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: TestUtils.createCylinderGeom(1),
    };
    manager.iModelDb.elements.insertElement(transformerPhysicalProps);
    // ACME Transformer - Relationship between EquipmentDefinition and 3d Template
    iModelDb.relationships.insertInstance({
      classFullName: "ElectricalEquipment:EquipmentDefinitionSpecifiesPhysicalRecipe",
      sourceId: transformerDefinitionId,
      targetId: transformerPhysicalTemplateId,
    });
    // ACME Transformer - Drawing Template
    const transformerDrawingTemplateId = manager.insertTemplateRecipe2d(containerId, "ACME Transformer");
    const transformerDrawingGraphicProps: GeometricElement2dProps = {
      classFullName: DrawingGraphic.classFullName,
      model: transformerDrawingTemplateId,
      category: equipmentDrawingCategoryId,
      code: Code.createEmpty(), // empty in the template, should be set when an instance is placed
      userLabel: "ACME Transformer",
      placement: { origin: Point2d.createZero(), angle: 0 },
      geom: TestUtils.createCircleGeom(1),
    };
    manager.iModelDb.elements.insertElement(transformerDrawingGraphicProps);
    // ACME Transformer - Relationship between EquipmentDefinition and 2d Template
    iModelDb.relationships.insertInstance({
      classFullName: "ElectricalEquipment:EquipmentDefinitionSpecifiesDrawingRecipe",
      sourceId: transformerDefinitionId,
      targetId: transformerDrawingTemplateId,
    });

    // ACME Breaker - EquipmentDefinition
    const breakerDefinitionId = iModelDb.elements.insertElement({
      classFullName: "ElectricalEquipment:EquipmentDefinition",
      model: containerId,
      code: manager.createEquipmentDefinitionCode(containerId, "ACME Breaker"),
      jsonProperties: { equipmentParams: { functionalClassFullName: "ElectricalEquipment:BreakerFunction" } },
    });
    // ACME Breaker - Physical Template
    const breakerPhysicalTemplateId = TemplateRecipe3d.insert(iModelDb, containerId, "ACME Breaker"); // this inserts the TemplateRecipe3d element and its sub-model
    const breakerPhysicalProps: PhysicalElementProps = {
      classFullName: "ElectricalEquipment:Breaker",
      model: breakerPhysicalTemplateId,
      category: equipmentSpatialCategoryId,
      code: Code.createEmpty(), // empty in the template, should be set when an instance is placed
      userLabel: "ACME Breaker",
      placement: { origin: Point3d.createZero(), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: TestUtils.createBoxGeom(Point3d.create(1, 1, 1)),
    };
    const breakerId = iModelDb.elements.insertElement(breakerPhysicalProps);
    // ACME Breaker - Input hook point
    const childElementProps: GeometricElement3dProps = {
      classFullName: SpatialLocation.classFullName,
      model: breakerPhysicalTemplateId,
      category: equipmentSpatialCategoryId,
      parent: new ElementOwnsChildElements(breakerId),
      code: Code.createEmpty(),
      userLabel: "Input",
      placement: { origin: Point3d.create(0.25, 0.5, 1), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: TestUtils.createPointGeom(),
    };
    iModelDb.elements.insertElement(childElementProps);
    // ACME Breaker - Output hook point
    childElementProps.userLabel = "Output";
    childElementProps.placement!.origin = Point3d.create(0.75, 0.5, 1);
    iModelDb.elements.insertElement(childElementProps);
    // ACME Breaker - Relationship between EquipmentDefinition and 3d Template
    iModelDb.relationships.insertInstance({
      classFullName: "ElectricalEquipment:EquipmentDefinitionSpecifiesPhysicalRecipe",
      sourceId: breakerDefinitionId,
      targetId: breakerPhysicalTemplateId,
    });
    // ACME Breaker - Drawing Template
    const breakerDrawingTemplateId = manager.insertTemplateRecipe2d(containerId, "ACME Breaker");
    const breakerDrawingGraphicProps: GeometricElement2dProps = {
      classFullName: DrawingGraphic.classFullName,
      model: breakerDrawingTemplateId,
      category: equipmentDrawingCategoryId,
      code: Code.createEmpty(), // empty in the template, should be set when an instance is placed
      userLabel: "ACME Breaker",
      placement: { origin: Point2d.createZero(), angle: 0 },
      geom: TestUtils.createRectangleGeom(Point2d.create(1, 1)),
    };
    manager.iModelDb.elements.insertElement(breakerDrawingGraphicProps);
    // ACME Breaker - Relationship between EquipmentDefinition and 2d Template
    iModelDb.relationships.insertInstance({
      classFullName: "ElectricalEquipment:EquipmentDefinitionSpecifiesDrawingRecipe",
      sourceId: breakerDefinitionId,
      targetId: breakerDrawingTemplateId,
    });
  }
}

class EquipmentPlacer extends TemplateModelCloner {
  private _definitionManager: StandardDefinitionManager;
  private _physicalModelId: Id64String;
  private _functionalModelId: Id64String;
  // private _drawingModelId: Id64String;

  public constructor(definitionManager: StandardDefinitionManager, physicalModelId: Id64String, functionalModelId: Id64String, _drawingModelId: Id64String) {
    super(definitionManager.iModelDb, definitionManager.iModelDb); // cloned Equipment instances will be in the same iModel as the EquipmentDefinition
    this._definitionManager = definitionManager;
    this._physicalModelId = physicalModelId;
    this._functionalModelId = functionalModelId;
    // this._drawingModelId = drawingModelId;
    const equipmentCategoryId = definitionManager.tryGetSpatialCategoryId(SpatialCategoryName.Equipment)!;
    this.context.remapElement(equipmentCategoryId, equipmentCategoryId); // map category of definition to category of instance - in this case the same
  }

  public async placeEquipmentInstance(equipmentDefinitionId: Id64String, placement: Placement3d, codeValue?: string): Promise<void> {
    const equipmentDefinition = this.sourceDb.elements.getElement<DefinitionElement>(equipmentDefinitionId, DefinitionElement);
    const physicalTemplateSql = "SELECT TargetECInstanceId FROM ElectricalEquipment:EquipmentDefinitionSpecifiesPhysicalRecipe WHERE SourceECInstanceId=:sourceId";
    const physicalTemplateId = this.sourceDb.withPreparedStatement(physicalTemplateSql, (statement: ECSqlStatement) => {
      statement.bindId("sourceId", equipmentDefinitionId);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : undefined;
    });
    // create the physical equipment by cloning/placing a template
    let physicalInstanceId: Id64String | undefined;
    if (physicalTemplateId) {
      const idMap = await super.placeTemplate3d(physicalTemplateId, this._physicalModelId, placement);
      if (codeValue) {
        for (const clonedInstanceId of idMap.values()) {
          const clonedInstance = this.targetDb.elements.tryGetElement<PhysicalElement>(clonedInstanceId, PhysicalElement);
          if (clonedInstance && !clonedInstance.parent) { // The codeValue applies to the "lead" PhysicalElement (will have a null parent indicating that it is not a child)
            physicalInstanceId = clonedInstance.id;
            const code = this._definitionManager.createEquipmentCode(codeValue);
            clonedInstance.code.spec = code.spec;
            clonedInstance.code.scope = code.scope;
            clonedInstance.code.value = code.value;
            clonedInstance.update();
            break;
          }
        }
      }
    }
    // create the functional equipment
    const functionalClassFullName = equipmentDefinition?.jsonProperties?.equipmentParams?.functionalClassFullName;
    if (functionalClassFullName) {
      const functionalInstanceId = this.targetDb.elements.insertElement({
        classFullName: functionalClassFullName,
        model: this._functionalModelId,
        code: codeValue ? this._definitionManager.createFunctionalEquipmentCode(codeValue) : Code.createEmpty(),
      });
      if (physicalInstanceId) {
        this.targetDb.relationships.insertInstance({
          classFullName: PhysicalElementFulfillsFunction.classFullName,
          sourceId: physicalInstanceId,
          targetId: functionalInstanceId,
        });
      }
    }
    // WIP: waiting for missing @bentley/imodeljs-backend placeTemplate2d API
    // create the DrawingGraphic by cloning/placing a template
    // const drawingTemplateSql = "SELECT TargetECInstanceId FROM ElectricalEquipment:EquipmentDefinitionSpecifiesDrawingRecipe WHERE SourceECInstanceId=:sourceId";
    // const drawingTemplateId = this.sourceDb.withPreparedStatement(drawingTemplateSql, (statement: ECSqlStatement) => {
    //   statement.bindId("sourceId", equipmentDefinitionId);
    //   return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : undefined;
    // });
    // let drawingGraphicInstanceId: Id64String | undefined;
    // ...
  }
}
