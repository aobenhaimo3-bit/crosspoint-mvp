"use client";

import { useId, useMemo, useRef, useState } from "react";

export type InterestPickerGroup = {
  id: string;
  label: string;
  description: string;
  items: readonly string[];
};

type InterestPickerProps = {
  groups: readonly InterestPickerGroup[];
  selected: readonly string[];
  minimum: number;
  onToggle: (item: string) => void;
};

export function InterestPicker({ groups, selected, minimum, onToggle }: InterestPickerProps) {
  const pickerId = useId().replace(/:/g, "");
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id ?? "");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const complete = selectedSet.size >= minimum;

  const selectedCountByGroup = useMemo(() => new Map(groups.map((group) => [
    group.id,
    group.items.filter((item) => selectedSet.has(item)).length,
  ])), [groups, selectedSet]);

  function focusTab(index: number) {
    const nextIndex = (index + groups.length) % groups.length;
    const nextGroup = groups[nextIndex];
    if (!nextGroup) return;
    setActiveGroupId(nextGroup.id);
    requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(groups.length - 1);
    }
  }

  if (!activeGroup) return null;

  return <fieldset className={`tag-group tara-tag-group interest-picker ${complete ? "is-complete" : ""}`}>
    <legend><span>我感兴趣</span><small>至少 {minimum} 个，可跨分类多选</small></legend>

    <div className={`interest-selection-bubble ${selected.length ? "has-selection" : ""}`}>
      <div className="interest-selection-copy">
        <div><span aria-hidden="true">✦</span><strong>我关心这些</strong></div>
        <small>{selected.length ? `已选 ${selected.length} 个，点击即可移除` : "先从下面选几个愿意聊的话题"}</small>
      </div>
      {selected.length > 0
        ? <ul className="interest-selected-list" aria-label="已选兴趣">
          {selected.map((item) => <li key={item}><button type="button" onClick={() => onToggle(item)} aria-label={`取消选择：${item}`}><span>{item}</span><span aria-hidden="true">×</span></button></li>)}
        </ul>
        : <p className="interest-selection-empty">你的选择会汇总在这里</p>}
    </div>

    <div className="interest-category-tabs" role="tablist" aria-label="兴趣分类">
      {groups.map((group, index) => {
        const active = group.id === activeGroup.id;
        const count = selectedCountByGroup.get(group.id) ?? 0;
        return <button
          key={group.id}
          ref={(node) => { tabRefs.current[index] = node; }}
          type="button"
          role="tab"
          id={`${pickerId}-tab-${group.id}`}
          aria-selected={active}
          aria-controls={`${pickerId}-panel-${group.id}`}
          tabIndex={active ? 0 : -1}
          className={active ? "active" : ""}
          onClick={() => setActiveGroupId(group.id)}
          onKeyDown={(event) => handleTabKeyDown(event, index)}
        >
          <span>{group.label}</span>
          <small className={count ? "has-count" : ""}>{count ? `${count} 已选` : `${group.items.length} 个`}</small>
        </button>;
      })}
    </div>

    <div
      className="interest-category-panel"
      role="tabpanel"
      id={`${pickerId}-panel-${activeGroup.id}`}
      aria-labelledby={`${pickerId}-tab-${activeGroup.id}`}
    >
      <div className="interest-category-heading">
        <div><strong>{activeGroup.label}</strong><p>{activeGroup.description}</p></div>
        <span>{activeGroup.items.length} 个词条</span>
      </div>
      <ul className="interest-option-grid">
        {activeGroup.items.map((item) => {
          const isSelected = selectedSet.has(item);
          return <li key={item}><button
            type="button"
            className={isSelected ? "selected" : ""}
            aria-pressed={isSelected}
            onClick={() => onToggle(item)}
          ><span aria-hidden="true">{isSelected ? "✓" : "+"}</span>{item}</button></li>;
        })}
      </ul>
    </div>

    <p className={complete ? "count-ok" : "count-note"} role="status" aria-live="polite" aria-atomic="true">
      {complete ? `已选 ${selected.length} 个，已满足` : `已选 ${selected.length} 个，还需 ${minimum - selected.length} 个`}
    </p>
  </fieldset>;
}
