/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import { IModelJsFs as fs } from "@bentley/imodeljs-backend";

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
}
