/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as path from "path";
import { DbResult, Id64, Id64String, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { Box, Cone, Point3d, PointString3d, Range3d, StandardViewIndex, Vector3d, YawPitchRollAngles } from "@bentley/geometry-core";
import {
  BackendLoggerCategory, BackendRequestContext, CategorySelector, DefinitionContainer, DefinitionElement, DisplayStyle3d, ECSqlStatement,
  ElementOwnsChildElements, FunctionalModel, FunctionalSchema, IModelDb, IModelHost, ModelSelector, OrthographicViewDefinition, PhysicalElement,
  PhysicalModel, SnapshotDb, SpatialCategory, SpatialLocation, TemplateModelCloner, TemplateRecipe3d,
} from "@bentley/imodeljs-backend";
import {
  Code, CodeScopeSpec, GeometricElement3dProps, GeometryStreamBuilder, GeometryStreamProps, IModel, PhysicalElementProps, Placement3d,
  SubCategoryAppearance,
} from "@bentley/imodeljs-common";
import { TestUtils } from "./TestUtils";

const loggerCategory = "TemplateClonerTest";

describe("TemplateCloner", () => {
  before(async () => {
    await IModelHost.startup();
    // optionally initialize logging
    if (true) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(BackendLoggerCategory.IModelExporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelImporter, LogLevel.Trace);
      Logger.setLevel(BackendLoggerCategory.IModelTransformer, LogLevel.Trace);
      Logger.setLevel(loggerCategory, LogLevel.Trace);
    }
  });

  after(async () => {
    await IModelHost.shutdown();
  });

  it("export", async () => {
    const iModelFileName = TestUtils.initOutputFile("TemplateCloner.bim");
    const iModelDb = SnapshotDb.createEmpty(iModelFileName, { rootSubject: { name: "TemplateCloner Test" }, createClassViews: true });
    const projectExtents = new Range3d(-2000, -2000, -500, 2000, 2000, 500); // set some arbitrary projectExtents that all SpatialElements should be within
    iModelDb.updateProjectExtents(projectExtents);
    const schemaFilePath = path.join(__dirname, "assets", "ElectricalEquipment.ecschema.xml");
    Logger.logInfo(loggerCategory, `${schemaFilePath}`);
    await iModelDb.importSchemas(new BackendRequestContext(), [FunctionalSchema.schemaFilePath, schemaFilePath]);
    const definitionManager = new StandardDefinitionManager(iModelDb);
    definitionManager.ensureStandardDefinitions();
    const equipmentCategoryId = definitionManager.tryGetStandardCategoryId(CategoryName.Equipment)!;
    const wireCategoryId = definitionManager.tryGetStandardCategoryId(CategoryName.Wire)!;
    assert.isTrue(Id64.isValidId64(equipmentCategoryId));
    assert.isTrue(Id64.isValidId64(wireCategoryId));
    definitionManager.ensureStandardDefinitions(); // call second time to simulate "already inserted" case
    const equipmentDefinitionCreator = new SampleEquipmentDefinitionCreator(definitionManager);
    equipmentDefinitionCreator.insertSampleComponentDefinitions();
    const physicalModelId = PhysicalModel.insert(iModelDb, IModel.rootSubjectId, "PhysicalModel");
    const functionalModelId = FunctionalModel.insert(iModelDb, IModel.rootSubjectId, "FunctionalModel");
    const physicalModel = iModelDb.models.getModel<PhysicalModel>(physicalModelId, PhysicalModel);
    const transformerDefinitionId = definitionManager.tryGetEquipmentDefinitionId("ACME Equipment", "ACME Transformer")!;
    const breakerDefinitionId = definitionManager.tryGetEquipmentDefinitionId("ACME Equipment", "ACME Breaker")!;
    assert.isTrue(Id64.isValidId64(transformerDefinitionId));
    assert.isTrue(Id64.isValidId64(breakerDefinitionId));
    const placer = new EquipmentPlacer(definitionManager, physicalModelId, functionalModelId);
    const transformerOrigins = [
      Point3d.create(10, 10), Point3d.create(20, 10), Point3d.create(30, 10),
      Point3d.create(10, 20), Point3d.create(20, 20), Point3d.create(30, 20),
      Point3d.create(10, 30), Point3d.create(20, 30), Point3d.create(30, 30),
    ];
    transformerOrigins.forEach((origin: Point3d, index: number) => {
      const placement = new Placement3d(origin, new YawPitchRollAngles(), new Range3d());
      placer.placeEquipmentInstance(transformerDefinitionId, placement, `T-${index + 1}`);
    });
    const breakerOrigins = [Point3d.create(-10, 0), Point3d.create(-20, 0), Point3d.create(-30, 0)];
    breakerOrigins.forEach((origin: Point3d, index: number) => {
      const placement = new Placement3d(origin, new YawPitchRollAngles(), new Range3d());
      placer.placeEquipmentInstance(breakerDefinitionId, placement, `B-${index + 1}`);
    });
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

/** Enum containing the names of the standard SpatialCategory and DrawingCategory elements created by this domain.
 * @note These names are scoped to a specific DefinitionContainer for uniqueness across domains.
 */
enum CategoryName {
  Equipment = "Equipment",
  Wire = "Wire",
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

  public tryGetStandardCategoryId(categoryName: string): Id64String | undefined {
    const containerId = this.tryGetContainerId(DefinitionContainerName.Categories);
    if (undefined === containerId) {
      return undefined;
    }
    return this.iModelDb.elements.queryElementIdByCode(SpatialCategory.createCode(this.iModelDb, containerId, categoryName));
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
    const containerCode = this.createDefinitionContainerCode(DefinitionContainerName.Categories);
    let containerId = this.iModelDb.elements.queryElementIdByCode(containerCode);
    if (undefined === containerId) {
      containerId = DefinitionContainer.insert(this.iModelDb, IModel.dictionaryId, containerCode);
    }
    this.ensureStandardCategory(containerId, CategoryName.Equipment, new SubCategoryAppearance());
    this.ensureStandardCategory(containerId, CategoryName.Wire, new SubCategoryAppearance());
  }

  private ensureStandardCategory(containerId: Id64String, categoryName: string, appearance: SubCategoryAppearance): Id64String {
    const categoryId = this.iModelDb.elements.queryElementIdByCode(SpatialCategory.createCode(this.iModelDb, containerId, categoryName));
    return categoryId ?? SpatialCategory.insert(this.iModelDb, containerId, categoryName, appearance);
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
    const equipmentCategoryId = manager.tryGetStandardCategoryId(CategoryName.Equipment)!;
    // ACME Transformer
    const transformerDefinitionId = iModelDb.elements.insertElement({
      classFullName: "ElectricalEquipment:EquipmentDefinition",
      model: containerId,
      code: manager.createEquipmentDefinitionCode(containerId, "ACME Transformer"),
      jsonProperties: { "equipmentParams": { functionalClassFullName: "ElectricalEquipment:TransformerFunction" } },
    });
    const transformerPhysicalTemplateId = TemplateRecipe3d.insert(iModelDb, containerId, "ACME Transformer"); // this inserts the TemplateRecipe3d element and its sub-model
    iModelDb.relationships.insertInstance({
      classFullName: "ElectricalEquipment:EquipmentDefinitionSpecifiesPhysicalRecipe",
      sourceId: transformerDefinitionId,
      targetId: transformerPhysicalTemplateId,
    });
    const transformerProps: PhysicalElementProps = {
      classFullName: "ElectricalEquipment:Transformer",
      model: transformerPhysicalTemplateId,
      category: equipmentCategoryId,
      code: Code.createEmpty(), // empty in the template, should be set when an instance is placed
      userLabel: "ACME Transformer",
      placement: { origin: Point3d.createZero(), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createCylinderGeom(1),
    };
    manager.iModelDb.elements.insertElement(transformerProps);
    // ACME Breaker
    const breakerDefinitionId = iModelDb.elements.insertElement({
      classFullName: "ElectricalEquipment:EquipmentDefinition",
      model: containerId,
      code: manager.createEquipmentDefinitionCode(containerId, "ACME Breaker"),
      jsonProperties: { "equipmentParams": { functionalClassFullName: "ElectricalEquipment:BreakerFunction" } },
    });
    const breakerPhysicalTemplateId = TemplateRecipe3d.insert(iModelDb, containerId, "ACME Breaker"); // this inserts the TemplateRecipe3d element and its sub-model
    iModelDb.relationships.insertInstance({
      classFullName: "ElectricalEquipment:EquipmentDefinitionSpecifiesPhysicalRecipe",
      sourceId: breakerDefinitionId,
      targetId: breakerPhysicalTemplateId,
    });
    const breakerProps: PhysicalElementProps = {
      classFullName: "ElectricalEquipment:Breaker",
      model: breakerPhysicalTemplateId,
      category: equipmentCategoryId,
      code: Code.createEmpty(), // empty in the template, should be set when an instance is placed
      userLabel: "ACME Breaker",
      placement: { origin: Point3d.createZero(), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createBoxGeom(Point3d.create(1, 1, 1)),
    };
    const breakerId = iModelDb.elements.insertElement(breakerProps);
    // Insert input hook point
    const childElementProps: GeometricElement3dProps = {
      classFullName: SpatialLocation.classFullName,
      model: breakerPhysicalTemplateId,
      category: equipmentCategoryId,
      parent: new ElementOwnsChildElements(breakerId),
      code: Code.createEmpty(),
      userLabel: "Input",
      placement: { origin: Point3d.create(0.25, 0.5, 1), angles: { yaw: 0, pitch: 0, roll: 0 } },
      geom: this.createPointGeom(),
    };
    iModelDb.elements.insertElement(childElementProps);
    // Insert output hook point
    childElementProps.userLabel = "Output";
    childElementProps.placement!.origin = Point3d.create(0.75, 0.5, 1);
    iModelDb.elements.insertElement(childElementProps);
  }
  /** Creates a GeometryStream containing a single cylinder entry. */
  private createCylinderGeom(radius: number): GeometryStreamProps {
    const pointA = Point3d.create(0, 0, 0);
    const pointB = Point3d.create(0, 0, 2 * radius);
    const cylinder = Cone.createBaseAndTarget(pointA, pointB, Vector3d.unitX(), Vector3d.unitY(), radius, radius, true);
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(cylinder);
    return builder.geometryStream;
  }
  /** Creates a GeometryStream containing a single box entry. */
  private createBoxGeom(size: Point3d): GeometryStreamProps {
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(Box.createDgnBox(
      Point3d.createZero(), Vector3d.unitX(), Vector3d.unitY(), new Point3d(0, 0, size.z),
      size.x, size.y, size.x, size.y, true,
    )!);
    return builder.geometryStream;
  }
  /** Creates a GeometryStream containing a single point entry. */
  private createPointGeom(): GeometryStreamProps {
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(PointString3d.create(Point3d.createZero()));
    return builder.geometryStream;
  }
}

class EquipmentPlacer extends TemplateModelCloner {
  private _definitionManager: StandardDefinitionManager;
  private _physicalModelId: Id64String;
  private _functionalModelId: Id64String;
  public constructor(definitionManager: StandardDefinitionManager, physicalModelId: Id64String, functionalModelId: Id64String) {
    super(definitionManager.iModelDb, definitionManager.iModelDb); // cloned Equipment instances will be in the same iModel as the EquipmentDefinition
    this._definitionManager = definitionManager;
    this._physicalModelId = physicalModelId;
    this._functionalModelId = functionalModelId;
    const equipmentCategoryId = definitionManager.tryGetStandardCategoryId(CategoryName.Equipment)!;
    this.context.remapElement(equipmentCategoryId, equipmentCategoryId); // map category of definition to category of instance - in this case the same
  }
  public placeEquipmentInstance(equipmentDefinitionId: Id64String, placement: Placement3d, codeValue?: string): void {
    const equipmentDefinition = this.sourceDb.elements.getElement<DefinitionElement>(equipmentDefinitionId, DefinitionElement);
    const sql = "SELECT TargetECInstanceId FROM ElectricalEquipment:EquipmentDefinitionSpecifiesPhysicalRecipe WHERE SourceECInstanceId=:sourceId";
    const physicalTemplateId = this.sourceDb.withPreparedStatement(sql, (statement: ECSqlStatement) => {
      statement.bindId("sourceId", equipmentDefinitionId);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : undefined;
    });
    // create the physical equipment by cloning/placing a template
    let physicalInstanceId: Id64String | undefined;
    if (physicalTemplateId) {
      const idMap = super.placeTemplate3d(physicalTemplateId, this._physicalModelId, placement);
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
          classFullName: "Functional:PhysicalElementFulfillsFunction",
          sourceId: physicalInstanceId,
          targetId: functionalInstanceId,
        });
      }
    }
  }
}
