import { fsCall } from "@renderer/lib/brain-fs";
import type React from "react";
import { useEffect, useRef, useState } from "react";

const CARD = "#fbf5e4";
const INK = "#2a2114";
const MUTE = "#8e7f5f";
const RULE = "#dbcca6";
const LANTERN = "#d98e2b";

const LABEL_NEAR = 60;

const GROUP_COLORS: Record<string, string> = {
  BRAIN: "#2a2114",
  memories: "#d98e2b",
  skills: "#3c4664",
  notes: "#8e7f5f",
  todos: "#9c3b24",
};

interface GraphNode {
  id: string;
  group: string;
  size: number;
}

interface GraphLink {
  source: string;
  target: string;
  kind: "index" | "ref";
}

interface GraphHandle {
  fit: () => void;
  clearSelection: () => void;
  destroy: () => void;
}

function colorFor(node: GraphNode): string {
  if (node.id === "BRAIN.md") return GROUP_COLORS.BRAIN;
  return GROUP_COLORS[node.group] ?? MUTE;
}

function labelFor(node: GraphNode): string {
  const base = (node.id.split("/").pop() ?? node.id).replace(/\.md$/, "");
  return base.length > 14 ? `${base.slice(0, 13)}…` : base;
}

function linkEnds(link: GraphLink): [string, string] {
  const src = link.source as unknown as { id?: string };
  const dst = link.target as unknown as { id?: string };
  return [
    typeof link.source === "string" ? link.source : (src.id ?? ""),
    typeof link.target === "string" ? link.target : (dst.id ?? ""),
  ];
}

export function BrainGraph({
  onOpen,
}: {
  onOpen: (path: string) => void;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<GraphHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    void (async () => {
      const [{ default: ForceGraph3D }, { default: SpriteText }, THREE, data] =
        await Promise.all([
          import("3d-force-graph"),
          import("three-spritetext"),
          import("three"),
          fsCall("graph", {}),
        ]);
      if (disposed) return;
      if (!data?.ok) {
        setFailed(true);
        return;
      }
      const nodes = (data.nodes as GraphNode[]) ?? [];
      const links = (data.links as GraphLink[]) ?? [];

      const degree = new Map<string, number>();
      const neighbors = new Map<string, Set<string>>();
      for (const l of links) {
        const [s, t] = linkEnds(l);
        degree.set(s, (degree.get(s) ?? 0) + 1);
        degree.set(t, (degree.get(t) ?? 0) + 1);
        if (!neighbors.has(s)) neighbors.set(s, new Set());
        if (!neighbors.has(t)) neighbors.set(t, new Set());
        neighbors.get(s)?.add(t);
        neighbors.get(t)?.add(s);
      }

      const materials = new Map<
        string,
        InstanceType<typeof THREE.MeshBasicMaterial>
      >();
      const labels = new Map<string, InstanceType<typeof SpriteText>>();
      const positions = new Map<string, { x: number; y: number; z: number }>();
      let hoveredId: string | null = null;
      let selectedId: string | null = null;
      let lastClick = { id: "", at: 0 };
      let fitted = false;

      const radiusFor = (n: GraphNode): number => {
        if (n.id === "BRAIN.md") return 3.6;
        return 2 + Math.min(1.6, (degree.get(n.id) ?? 0) * 0.25);
      };

      const applyEmphasis = (): void => {
        const focusId = hoveredId ?? selectedId;
        const near = focusId
          ? new Set([focusId, ...(neighbors.get(focusId) ?? [])])
          : null;
        for (const [nid, mat] of materials) {
          mat.opacity = !near || near.has(nid) ? 1 : 0.14;
        }
        for (const [nid, label] of labels) {
          label.userData.dimmed = !!near && !near.has(nid);
        }
      };

      const { width, height } = host.getBoundingClientRect();
      const instance = new ForceGraph3D(host, {
        controlType: "orbit",
        rendererConfig: { antialias: true, alpha: false },
      })
        .width(Math.max(200, width))
        .height(Math.max(200, height))
        .backgroundColor(CARD)
        .showNavInfo(false)
        .nodeLabel(() => "")
        .nodeThreeObject((node) => {
          const n = node as GraphNode;
          const material = new THREE.MeshBasicMaterial({
            color: colorFor(n),
            transparent: true,
            opacity: 1,
          });
          // Pixel cubes, per the gamified Tavern sheet.
          const size = radiusFor(n) * 1.7;
          const sphere = new THREE.Mesh(
            new THREE.BoxGeometry(size, size, size),
            material,
          );
          materials.set(n.id, material);

          const label = new SpriteText(labelFor(n));
          label.color = n.id === "BRAIN.md" ? INK : MUTE;
          label.textHeight = 2.1;
          label.material.transparent = true;
          label.material.opacity = 0.9;
          label.position.set(0, -(radiusFor(n) + 3), 0);
          label.userData.nodeId = n.id;
          labels.set(n.id, label);

          const group = new THREE.Group();
          group.add(sphere);
          group.add(label);
          return group;
        })
        .linkColor((l) => ((l as GraphLink).kind === "ref" ? LANTERN : RULE))
        .linkOpacity(0.5)
        .linkWidth(0)
        .onNodeHover((node) => {
          const id = (node as GraphNode | null)?.id ?? null;
          if (id === hoveredId) return;
          hoveredId = id;
          host.style.cursor = id ? "pointer" : "grab";
          applyEmphasis();
        })
        .onNodeClick((node) => {
          const n = node as GraphNode & { x: number; y: number; z: number };
          const now = Date.now();
          if (lastClick.id === n.id && now - lastClick.at < 450) {
            onOpen(n.id);
            return;
          }
          lastClick = { id: n.id, at: now };
          selectedId = n.id;
          setSelected(n.id);
          applyEmphasis();
          const dist = 90;
          const len = Math.hypot(n.x, n.y, n.z) || 1;
          const ratio = 1 + dist / len;
          instance.cameraPosition(
            { x: n.x * ratio, y: n.y * ratio, z: n.z * ratio },
            { x: n.x, y: n.y, z: n.z },
            700,
          );
        })
        .onBackgroundClick(() => {
          selectedId = null;
          setSelected(null);
          applyEmphasis();
        })
        .onEngineTick(() => {
          for (const node of instance.graphData().nodes as Array<
            GraphNode & { x?: number; y?: number; z?: number }
          >) {
            if (node.x !== undefined)
              positions.set(node.id, {
                x: node.x,
                y: node.y ?? 0,
                z: node.z ?? 0,
              });
          }
        })
        .warmupTicks(100)
        .cooldownTicks(80)
        .onEngineStop(() => {
          if (!fitted) {
            fitted = true;
            manualFit(600);
            host.dataset.state = "fitted";
          }
        })
        .graphData({ nodes, links });

      instance.d3Force("charge")?.strength(-90);

      let labelFar = 380;
      const manualFit = (ms: number): void => {
        const linked = [...positions.entries()]
          .filter(([nid]) => (degree.get(nid) ?? 0) > 0)
          .map(([, p]) => p);
        const pts = linked.length >= 2 ? linked : [...positions.values()];
        if (pts.length === 0) return;
        const c = pts.reduce(
          (acc, p) => ({
            x: acc.x + p.x / pts.length,
            y: acc.y + p.y / pts.length,
            z: acc.z + p.z / pts.length,
          }),
          { x: 0, y: 0, z: 0 },
        );
        const r = Math.max(
          20,
          ...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)),
        );
        const dist = r * 2.4 + 30;
        labelFar = Math.max(240, dist * 1.6);
        instance.cameraPosition(
          { x: c.x, y: c.y, z: c.z + dist },
          { x: c.x, y: c.y, z: c.z },
          ms,
        );
      };

      const controls = instance.controls() as {
        minDistance?: number;
        maxDistance?: number;
        enableDamping?: boolean;
      };
      controls.minDistance = 15;
      controls.maxDistance = 700;
      controls.enableDamping = true;

      let raf = 0;
      const fadeLabels = (): void => {
        const cam = instance.camera();
        for (const [nid, label] of labels) {
          const pos = positions.get(nid);
          if (!pos) continue;
          const dist = Math.hypot(
            cam.position.x - pos.x,
            cam.position.y - pos.y,
            cam.position.z - pos.z,
          );
          const range = Math.min(
            1,
            Math.max(0, (labelFar - dist) / (labelFar - LABEL_NEAR)),
          );
          const pinned = nid === "BRAIN.md" || nid === selectedId;
          const base = pinned ? Math.max(0.85, range) : range * 0.9;
          label.material.opacity = label.userData.dimmed ? 0.12 : base;
        }
        raf = requestAnimationFrame(fadeLabels);
      };
      raf = requestAnimationFrame(fadeLabels);

      handleRef.current = {
        fit: () => manualFit(600),
        clearSelection: () => {
          selectedId = null;
          setSelected(null);
          applyEmphasis();
        },
        destroy: () => {
          cancelAnimationFrame(raf);
          (instance as unknown as { _destructor?: () => void })._destructor?.();
        },
      };
    })().catch(() => setFailed(true));

    return () => {
      disposed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [onOpen]);

  if (failed)
    return <div className="tavern-empty">Couldn't load the brain graph.</div>;

  return (
    <div className="tavern-graph-wrap">
      <div ref={hostRef} className="tavern-brain-graph" />
      <button
        type="button"
        className="tavern-graph-fit"
        title="Fit the whole brain in view"
        onClick={() => handleRef.current?.fit()}
      >
        ⌂
      </button>
      {selected ? (
        <div className="tavern-graph-chip">
          <span className="tavern-graph-chip-name">
            {selected.replace(/\.md$/, "")}
          </span>
          <button
            type="button"
            className="tavern-graph-chip-open"
            onClick={() => onOpen(selected)}
          >
            Open
          </button>
          <button
            type="button"
            className="tavern-graph-chip-clear"
            aria-label="Clear selection"
            onClick={() => handleRef.current?.clearSelection()}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
