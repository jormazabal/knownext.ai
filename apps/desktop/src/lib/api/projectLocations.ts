import {requestJson} from "./client";
import type {ProjectLocationReview} from "../../types/projectLocation";
export function reviewProjectLocation(projectId:string,folderPath:string){return requestJson<ProjectLocationReview>(`/api/projects/${encodeURIComponent(projectId)}/location/review`,{method:"POST",body:JSON.stringify({folderPath})});}
