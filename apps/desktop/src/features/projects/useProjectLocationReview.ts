import {useEffect,useRef,useState} from "react";
import {reviewProjectLocation} from "../../lib/api/projectLocations";
import type {ProjectLocationReview} from "../../types/projectLocation";

export function useProjectLocationReview(projectId:string|null){
  const[review,setReview]=useState<ProjectLocationReview|null>(null);
  const owner=useRef(projectId);owner.current=projectId;
  const sequence=useRef(0);const inFlight=useRef(false);
  const resolve=useRef<((review:ProjectLocationReview|null)=>void)|null>(null);
  useEffect(()=>{sequence.current++;resolve.current?.(null);resolve.current=null;setReview(null);return()=>{sequence.current++;resolve.current?.(null);resolve.current=null;};},[projectId]);
  async function request(id:string,folderPath:string){
    if(inFlight.current||owner.current!==id)return null;
    inFlight.current=true;const epoch=sequence.current;
    try{
      const next=await reviewProjectLocation(id,folderPath);
      if(sequence.current!==epoch||owner.current!==id||next.projectId!==id)return null;
      return await new Promise<ProjectLocationReview|null>(done=>{resolve.current=done;setReview(next);});
    }finally{inFlight.current=false;}
  }
  function settle(confirmed:boolean){
    const done=resolve.current;resolve.current=null;setReview(null);
    done?.(confirmed&&review?.projectId===owner.current?review:null);
  }
  return{review,request,confirm:()=>settle(true),cancel:()=>settle(false),owns:(id:string)=>owner.current===id};
}
