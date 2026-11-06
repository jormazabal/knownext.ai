import {useCallback,useEffect,useRef,useState,type SetStateAction} from "react";

const wideQuery="(min-width: 1280px)";
const isWide=()=>typeof window.matchMedia!=="function" || window.matchMedia(wideQuery).matches;

/** Pinning restores a side panel on desktop; an overlay needs explicit intent. */
export function useContextVisibility(pinned:boolean,projectId:string|null,activeTabId?:string|null) {
  const [wide,setWide]=useState(isWide);
  const [visible,setVisible]=useState(()=>pinned&&isWide());
  const explicitlyHidden=useRef(false);
  const setUserVisible=useCallback((value:SetStateAction<boolean>)=>setVisible(previous=>{
    const next=typeof value==="function"?value(previous):value;
    explicitlyHidden.current=!next;
    return next;
  }),[]);
  const previous=useRef({pinned,projectId,activeTabId,wide});
  useEffect(()=>{
    if(typeof window.matchMedia!=="function")return;
    const media=window.matchMedia(wideQuery);
    const change=()=>setWide(media.matches);
    change();media.addEventListener("change",change);
    return ()=>media.removeEventListener("change",change);
  },[]);
  useEffect(()=>{
    const pinActivated=pinned && !previous.current.pinned;
    const projectChanged=projectId!==previous.current.projectId;
    const tabChanged=activeTabId!==previous.current.activeTabId;
    const widthChanged=wide!==previous.current.wide;
    if(pinActivated)explicitlyHidden.current=false;
    if(!wide && (projectChanged||tabChanged||widthChanged))setVisible(false);
    else if(wide && (pinActivated || (widthChanged&&pinned&&!explicitlyHidden.current))) setVisible(true);
    else if(projectChanged && !pinned) setVisible(false);
    previous.current={pinned,projectId,activeTabId,wide};
  },[pinned,projectId,activeTabId,wide]);
  return [visible,setUserVisible] as const;
}
