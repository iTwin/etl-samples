/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as path from "path";
import { Arc3d, Box, Cone, LineString3d, Point2d, Point3d, PointString3d, Vector3d } from "@itwin/core-geometry";
import { IModelJsFs as fs } from "@itwin/core-backend";
import { GeometryStreamBuilder, GeometryStreamProps } from "@itwin/core-common";

/** Test utilities */
export class TestUtils {
  /** Make sure that the output directory exists and the output file of the specified name does not. */
  public static initOutputFile(fileBaseName: string) {
    const outputDirName = path.join(__dirname, "output");
    if (!fs.existsSync(outputDirName)) {
      fs.mkdirSync(outputDirName);
    }
    const outputFileName = path.join(outputDirName, fileBaseName);
    if (fs.existsSync(outputFileName)) {
      fs.removeSync(outputFileName);
    }
    return outputFileName;
  }

  /** Creates a GeometryStream containing a single cylinder entry. */
  public static createCylinderGeom(radius: number): GeometryStreamProps {
    const pointA = Point3d.create(0, 0, 0);
    const pointB = Point3d.create(0, 0, 2 * radius);
    const cylinder = Cone.createBaseAndTarget(pointA, pointB, Vector3d.unitX(), Vector3d.unitY(), radius, radius, true);
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(cylinder);
    return builder.geometryStream;
  }

  /** Creates a GeometryStream containing a single box entry. */
  public static createBoxGeom(size: Point3d): GeometryStreamProps {
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(Box.createDgnBox(
      Point3d.createZero(), Vector3d.unitX(), Vector3d.unitY(), new Point3d(0, 0, size.z),
      size.x, size.y, size.x, size.y, true,
    )!);
    return builder.geometryStream;
  }

  /** Creates a GeometryStream containing a single point entry. */
  public static createPointGeom(): GeometryStreamProps {
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(PointString3d.create(Point3d.createZero()));
    return builder.geometryStream;
  }

  /** Creates a GeometryStream containing a single circle entry. */
  public static createCircleGeom(radius: number): GeometryStreamProps {
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(Arc3d.createXY(Point3d.createZero(), radius)); // NOTE: will be valid for a GeometricElement2d GeometryStream
    return builder.geometryStream;
  }

  /** Creates a GeometryStream containing a single rectangle entry. */
  public static createRectangleGeom(size: Point2d): GeometryStreamProps {
    const builder = new GeometryStreamBuilder();
    builder.appendGeometry(LineString3d.createPoints([
      new Point3d(0, 0),
      new Point3d(size.x, 0),
      new Point3d(size.x, size.y),
      new Point3d(0, size.y),
      new Point3d(0, 0),
    ]));
    return builder.geometryStream;
  }
}
