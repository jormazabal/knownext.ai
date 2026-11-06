import {useEffect, useRef, useState} from "react";
import {ProjectWork} from "./projectWork";
export function useProjectWork(projectId: string | undefined) {
  const [, update] = useState(0);
  const state = useRef<ProjectWork | null>(null);
  if (!state.current) state.current = new ProjectWork(() => update(value => value + 1));
  const work = state.current;
  work.select(projectId);
  useEffect(() => { work.resume(); return () => work.suspend(); }, [work]);
  return work;
}
