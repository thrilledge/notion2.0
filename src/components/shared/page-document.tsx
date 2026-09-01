"use client";

import type { ProjectContentBlock } from "@/hooks/use-project-content";
import { BlockView } from "@/components/projects/block-renderer";

export function PageDocument({ blocks }: { blocks: ProjectContentBlock[] }) {
  const sorted = [...blocks].sort((a, b) => a.position - b.position);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This page is empty.
      </p>
    );
  }

  let bulletOpen = false;
  let numOpen = false;
  const nodes: React.ReactNode[] = [];

  const closeLists = () => {
    if (bulletOpen) {
      nodes.push(<ul key={`ul-${nodes.length}`} className="my-1" />);
      bulletOpen = false;
    }
    if (numOpen) {
      nodes.push(<ol key={`ol-${nodes.length}`} className="my-1" />);
      numOpen = false;
    }
  };

  for (const block of sorted) {
    if (block.type === "bulleted_list") {
      if (numOpen) {
        nodes.push(<ol key={`ol-${nodes.length}`} className="my-1" />);
        numOpen = false;
      }
      if (!bulletOpen) {
        nodes.push(<ul key={`ul-${nodes.length}`} className="my-1" />);
        bulletOpen = true;
      }
      nodes.push(<BlockView key={block.id} block={block} />);
    } else if (block.type === "numbered_list") {
      if (bulletOpen) {
        nodes.push(<ul key={`ul-${nodes.length}`} className="my-1" />);
        bulletOpen = false;
      }
      if (!numOpen) {
        nodes.push(<ol key={`ol-${nodes.length}`} className="my-1" />);
        numOpen = true;
      }
      nodes.push(<BlockView key={block.id} block={block} />);
    } else {
      if (bulletOpen) {
        nodes.push(<ul key={`ul-${nodes.length}`} className="my-1" />);
        bulletOpen = false;
      }
      if (numOpen) {
        nodes.push(<ol key={`ol-${nodes.length}`} className="my-1" />);
        numOpen = false;
      }
      nodes.push(<BlockView key={block.id} block={block} />);
    }
  }

  closeLists();

  return <div className="space-y-0.5">{nodes}</div>;
}
