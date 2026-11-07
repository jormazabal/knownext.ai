export type DiagnosticOperation="startup"|"document"|"project"|"ai"|"settings"|"runtime"|"application";
export type DiagnosticEvent={id:string;at:string;level:"error"|"info";operation:DiagnosticOperation;code:"operation-failed"|"operation-recorded"};
export type DiagnosticReport={schemaVersion:1;generatedAt:string;app:"KnowNext.ai";version:string;platform:string;recordingEnabled:boolean;maximumEvents:number;maximumBytes:number;events:DiagnosticEvent[];warnings:string[];includesPrivateContent:false};
