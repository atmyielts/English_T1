import { ArrowRight, Tag } from 'lucide-react';
import { formatSatDomain, formatSatSection } from '@schood/sat-core';
import type { NotebookItem } from '../lib/api';

export const MistakeNotebookList = (props: {
  items: NotebookItem[];
  onRetry?: (item: NotebookItem) => void;
  onTag?: (item: NotebookItem, reasonTag: string) => void;
}) => (
  <ul className="notebook-list">
    {props.items.map((item) => (
      <li key={item.id} className="notebook-row">
        <div>
          <div className="chip-row">
            <span className={`chip ${item.section_type}`}>{formatSatSection(item.section_type)}</span>
            <span className="chip neutral">{formatSatDomain(item.domain)}</span>
            <span className="chip neutral">{item.difficulty}</span>
          </div>
          <strong>{item.mistake_pattern || 'Missed SAT item'}</strong>
          <p>{item.coach_note ?? `Reason: ${item.reason_tag.replace(/_/g, ' ')}`}</p>
        </div>
        <div className="row-actions">
          <select
            value={item.reason_tag}
            onChange={(event) => props.onTag?.(item, event.target.value)}
            aria-label="Reason tag"
          >
            <option value="concept_gap">Concept gap</option>
            <option value="careless">Careless</option>
            <option value="time_pressure">Time pressure</option>
            <option value="misread_wording">Misread wording</option>
            <option value="unknown">Unknown</option>
          </select>
          <button type="button" className="icon-button" onClick={() => props.onRetry?.(item)} title="Retry similar">
            <ArrowRight size={17} />
          </button>
          <Tag size={15} aria-hidden="true" />
        </div>
      </li>
    ))}
  </ul>
);
