import { ChevronRight, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type FloatingMenuItem<Action extends string> = {
  label: string;
  icon: LucideIcon;
  action?: Action;
  submenu?: FloatingMenuItem<Action>[];
};

type Props<Action extends string> = {
  items: FloatingMenuItem<Action>[];
  x?: number;
  y?: number;
  anchor?: HTMLButtonElement;
  label?: string;
  depth?: number;
  focusOnOpen?: boolean;
  onBack?: () => void;
  onSelect: (action: Action) => void;
  onClose?: () => void;
};

/** Each submenu owns a body-level layer, outside its parent's scroll container. */
export function FloatingTreeMenu<Action extends string>({items,x=8,y=8,anchor,label,depth=0,focusOnOpen,onBack,onSelect,onClose}:Props<Action>) {
  const menu=useRef<HTMLDivElement>(null);
  const buttons=useRef<Array<HTMLButtonElement|null>>([]);
  const [expanded,setExpanded]=useState<number|null>(null);
  const [focusChild,setFocusChild]=useState(false);
  const [position,setPosition]=useState({left:x,top:y});

  useLayoutEffect(()=>{
    const positionLayer=()=>{
      const panel=menu.current;if(!panel)return;
      const width=panel.getBoundingClientRect().width || (depth ? 190 : 244);
      const height=panel.getBoundingClientRect().height || items.length*32+10;
      const viewportWidth=window.innerWidth,viewportHeight=window.innerHeight;
      const parent=anchor?.getBoundingClientRect();
      const left=parent ? (parent.right+6+width<=viewportWidth-8 ? parent.right+6 : parent.left-width-6) : x;
      const top=parent?.top ?? y;
      const next={left:Math.max(8,Math.min(left,viewportWidth-width-8)),top:Math.max(8,Math.min(top,viewportHeight-height-8))};
      setPosition(current=>current.left===next.left&&current.top===next.top ? current : next);
    };
    positionLayer();window.addEventListener("resize",positionLayer);window.addEventListener("scroll",positionLayer,true);
    if(focusOnOpen)buttons.current[0]?.focus();
    return()=>{window.removeEventListener("resize",positionLayer);window.removeEventListener("scroll",positionLayer,true);};
  },[anchor,x,y,depth,items.length,focusOnOpen]);

  function open(index:number,focus:boolean){setFocusChild(focus);setExpanded(index);}
  function keys(event:KeyboardEvent<HTMLDivElement>){
    if((event.target as HTMLElement).closest('[data-floating-tree-menu]')!==event.currentTarget)return;
    const index=buttons.current.indexOf(document.activeElement as HTMLButtonElement);
    if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      const next=event.key==="Home"?0:event.key==="End"?items.length-1:(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length;
      setExpanded(null);buttons.current[next]?.focus();
    }else if(event.key==="ArrowRight"&&items[index]?.submenu?.length){event.preventDefault();event.stopPropagation();open(index,true);}
    else if((event.key==="ArrowLeft"||event.key==="Escape")&&onBack){event.preventDefault();event.stopPropagation();onBack();}
    else if(event.key==="Tab")onClose?.();
  }
  const child=expanded===null?undefined:items[expanded];
  const childAnchor=expanded===null?null:buttons.current[expanded];
  return <div ref={menu} data-document-tree-menu="true" data-floating-tree-menu={depth} role="menu" aria-label={label??"Acciones del archivo"} className="knownext-tree-menu" style={{left:position.left,top:position.top,width:depth?190:244,zIndex:60+depth}} onKeyDown={keys} onScroll={()=>setExpanded(null)}>
    {items.map((item,index)=><button key={item.label} ref={element=>{buttons.current[index]=element;}} role="menuitem" aria-haspopup={item.submenu?.length?"menu":undefined} aria-expanded={item.submenu?.length?expanded===index:undefined}
      onMouseEnter={()=>item.submenu?.length?open(index,false):setExpanded(null)}
      onFocus={()=>{if(expanded!==index)setExpanded(null);}}
      onClick={()=>{if(item.submenu?.length)open(index,true);else if(item.action)onSelect(item.action);}}>
      <item.icon size={15}/><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.submenu?.length?<ChevronRight size={13}/>:null}
    </button>)}
    {child?.submenu?.length&&childAnchor ? createPortal(<FloatingTreeMenu items={child.submenu} anchor={childAnchor} label={child.label} depth={depth+1} focusOnOpen={focusChild} onBack={()=>{setExpanded(null);childAnchor.focus();}} onSelect={onSelect} onClose={onClose}/>,document.body):null}
  </div>;
}
