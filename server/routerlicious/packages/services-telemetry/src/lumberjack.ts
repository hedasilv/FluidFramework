/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { LumberEventName } from "./lumberEventNames";
import { Lumber } from "./lumber";
import { LogLevel, LumberType, ILumberjackEngine, ILumberjackSchemaValidator } from "./resources";

// Lumberjack is a telemetry manager class that allows the collection of metrics and logs
// throughout the service. A list of ILumberjackEngine must be provided to Lumberjack
// by calling setupEngines() before Lumberjack can be used.
export class Lumberjack {
    private readonly _engineList: ILumberjackEngine[] = [];
    private _schemaValidator!: ILumberjackSchemaValidator;
    private _isSetupCompleted: boolean = false;
    protected static _instance: Lumberjack | undefined = undefined;

    protected constructor() {}

    protected static get instance() {
        if (!Lumberjack._instance) {
            Lumberjack._instance = new Lumberjack();
        }

        return Lumberjack._instance;
    }

    public static create(
        engines: ILumberjackEngine[],
        schemaValidator: ILumberjackSchemaValidator) {
        const newInstance = new Lumberjack();
        newInstance.setup(engines, schemaValidator);
        return newInstance;
    }

    public static setup(
        engines: ILumberjackEngine[],
        schemaValidator: ILumberjackSchemaValidator) {
        this.instance.setup(engines, schemaValidator);
    }

    public static newLumberMetric<T extends string = LumberEventName>(
        eventName: T,
        properties?: Map<string, any> | Record<string, any>) {
        return this.instance.newLumberMetric<T>(eventName, properties);
    }

    public static log(
        message: string,
        level: LogLevel,
        properties?: Map<string, any> | Record<string, any>,
        statusCode?: number | string,
        exception?: Error) {
        this.instance.log(message, level, properties, statusCode, exception);
    }

    public setup(
        engines: ILumberjackEngine[],
        schemaValidator: ILumberjackSchemaValidator) {
        if (this._isSetupCompleted) {
            throw new Error("This Lumberjack was already setup with a list of engines and schema validator.");
        }

        if (engines.length === 0) {
            throw new Error("The provided engine list is empty. Please provide at list one LumberjackEngine.");
        }

        this._engineList.push(...engines);
        this._schemaValidator = schemaValidator;
        this._isSetupCompleted = true;
    }

    public newLumberMetric<T extends string = LumberEventName>(
        eventName: T,
        properties?: Map<string, any> | Record<string, any>) {
        this.throwOnIncompleteSetup();
        return new Lumber<T>(eventName, LumberType.Metric, this._engineList, this._schemaValidator, properties);
    }

    public log(
        message: string,
        level: LogLevel,
        properties?: Map<string, any> | Record<string, any>,
        statusCode?: number | string,
        exception?: Error) {
        this.throwOnIncompleteSetup();
        const lumber = new Lumber<string>(
            this.getLogCallerInfo(),
            LumberType.Log,
            this._engineList,
            this._schemaValidator,
            properties);

        if (level === LogLevel.Warning || level === LogLevel.Error) {
            lumber.error(message, statusCode, exception, level);
        } else {
            lumber.success(message, statusCode, level);
        }
    }

    /**
    * For logs, we can use the caller information as a form of event name
    * until we have a better solution. In order to do that, we use NodeJS's
    * CallSite to extract information such as file name and function name.
    * Caveat: function names do not work properly when using callbacks.
    * For more info, see:
    * https://v8.dev/docs/stack-trace-api#customizing-stack-traces
    * @returns {string} filename and function separated by a colon
    */
    private getLogCallerInfo(): string {
        const defaultPrefix = "LogMessage";
        const defaultStackTracePreparer = Error.prepareStackTrace;
        try {
            Error.prepareStackTrace = (_, structuredStackTrace) => {
                const caller = structuredStackTrace[0];
                const fileName = caller.getFileName() ?? "FilenameNotAvailable";
                const functionName = caller.getFunctionName() ?? caller.getMethodName() ?? "FunctionNameNotAvailable";
                return `${defaultPrefix}:${path.basename(fileName)}:${functionName}`;
            };
            const err = new Error();
            // eslint-disable-next-line @typescript-eslint/unbound-method
            Error.captureStackTrace(err, this.log);

            const response = err.stack ?? defaultPrefix;
            return response;
        } catch (err) {
            return defaultPrefix;
        } finally {
            Error.prepareStackTrace = defaultStackTracePreparer;
        }
   }

    private throwOnIncompleteSetup() {
        if (!this._isSetupCompleted) {
            throw new Error("Lumberjack has not been setup yet. It requires an engine list and a schema validator.");
        }
    }
}
