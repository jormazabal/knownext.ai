import {useCallback,useEffect,useRef,useState} from "react";
import type {AssetMoveReview} from "../types/assetMove";
export function useAssetMoveReview(projectId:string|null){
 const [review,setReview]=useState<AssetMoveReview|null>(null);const pending=useRef<((value:boolean)=>void)|null>(null);
 const settle=useCallback((value:boolean)=>{const resolve=pending.current;pending.current=null;setReview(null);resolve?.(value);},[]);
 useEffect(()=>{settle(false);return()=>{pending.current?.(false);pending.current=null;};},[projectId,settle]);
 const request=useCallback((value:AssetMoveReview)=>{pending.current?.(false);setReview(value);return new Promise<boolean>(resolve=>{pending.current=resolve;});},[]);
 return {review,request,settle};
}
