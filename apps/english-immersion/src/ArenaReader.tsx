import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Article } from './ArenaList';

type DepthLayer = 0 | 1 | 2 | 3 | 4;

const LAYERS = [
    { id: 0, label: 'Surface', description: 'Just the literal text stream.' },
    { id: 1, label: 'Clarified', description: 'Ambiguous phrases resolved for clarity.' },
    { id: 2, label: 'Structural', description: 'Underlying logical map and flow.' },
    { id: 3, label: 'Semantic', description: 'Why this specific word? Nuance revealed.' },
    { id: 4, label: 'Authorial Intent', description: 'The functional "job" of the sentence.' },
];

type TextNode = {
    id: string;
    content: Record<DepthLayer, string>;
    gravityWords: string[];
    isBoundary: boolean; // Meaning Boundary Detection trigger
    complexity: number; // 1-10 for Cognitive Load Balancing
};

const SOPHISTICATED_CONTENT: TextNode[] = [
    {
        id: 's1',
        content: {
            0: "The prevailing architecture of modern cognitive systems remains a profound enigma to contemporary neuroscience.",
            1: "The current design of brain-like machines is still a huge, deep mystery to today's brain scientists.",
            2: "[PREMISE: System Architecture] -> (Status: Enigma) | [DOMAIN: Neuroscience]",
            3: "'Architecture' implies an intentional, rigid blueprint; 'Enigma' suggests a cipher waiting to be cracked.",
            4: "Establishes the scientific context and the specific 'void' in current knowledge.",
        },
        gravityWords: ['architecture', 'cognitive', 'enigma'],
        isBoundary: false,
        complexity: 4,
    },
    {
        id: 's2',
        content: {
            0: "Recent breakthroughs in high-fidelity neural mapping suggest that semantic networks are not static entities but dynamic landscapes.",
            1: "New discoveries in very detailed brain imaging show that meaning-webs aren't fixed things; they change like weather.",
            2: "Evidence: [Neural Mapping] => Rejection: {Static} => Proposal: {Dynamic Landscapes}",
            3: "'High-fidelity' emphasizes precision; 'Static' vs 'Dynamic' creates the core tension.",
            4: "Challenges the status quo by introducing the 'changeable' nature of thought structures.",
        },
        gravityWords: ['fidelity', 'semantic', 'dynamic'],
        isBoundary: true,
        complexity: 7,
    },
    {
        id: 's3',
        content: {
            0: "These networks operate as fluid topographies where meaning density shifts based on the velocity of active attention.",
            1: "These systems work like water-like maps where the weight of understanding moves according to how fast we focus.",
            2: "Process: [Fluid Topographies] | Variable: {Meaning Density} | Driver: <Attention Velocity>",
            3: "'Topographies' suggests a 3D space of meaning; 'Velocity' links focus to physical speed.",
            4: "Synthesizes the dynamic nature of the brain into a measurable mechanical process.",
        },
        gravityWords: ['fluid', 'density', 'velocity'],
        isBoundary: false,
        complexity: 8,
    },
    {
        id: 's4',
        content: {
            0: "Consequently, the traditional binary of 'understanding' versus 'confusion' is increasingly seen as a relic of a flatter era.",
            1: "Therefore, the old idea that you either 'get it' or you 'don't' is starting to look like an outdated, simple concept.",
            2: "Conclusion: [Binary Mode] -> [OUTDATED] | Era: {Flat}",
            3: "'Binary' highlights the oversimplification; 'Relic' dismisses the old view as ancient/useless.",
            4: "Dismisses previous reading models to make room for the 'Deep Reading' paradigm.",
        },
        gravityWords: ['binary', 'relic', 'flatter'],
        isBoundary: true,
        complexity: 6,
    }
];

export const ArenaReader = ({ article, onBack }: { article: Article; onBack: () => void }) => {
    const [layer, setLayer] = useState<DepthLayer>(0);
    const [isolatedSentence, setIsolatedSentence] = useState<string | null>(null);
    const [frictionZones, setFrictionZones] = useState<Set<string>>(new Set());
    const [isCompressed, setIsCompressed] = useState(false);
    const [density, setDensity] = useState<'light' | 'dense'>('dense');
    const [gravityActive, setGravityActive] = useState(true);
    const [reconstructionMode, setReconstructionMode] = useState(false);
    const [cognitiveStabilization, setCognitiveStabilization] = useState(0);

    // Cognitive Load Balancing: Subtle stabilization based on sentence complexity
    useEffect(() => {
        if (isolatedSentence) {
            const node = SOPHISTICATED_CONTENT.find(n => n.id === isolatedSentence);
            if (node) {
                setCognitiveStabilization(node.complexity * 10); // scale to visual delay
            }
        } else {
            setCognitiveStabilization(0);
        }
    }, [isolatedSentence]);

    const toggleFriction = (id: string) => {
        const next = new Set(frictionZones);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setFrictionZones(next);
    };

    const portalTarget = document.getElementById('arena-sidebar-portal');

    const controls = (
        <div className="arena-sidebar-controls">
            <section className="control-group">
                <label>Vertical Depth Layers</label>
                <div className="depth-track">
                    {LAYERS.map(l => (
                        <button
                            key={l.id}
                            className={`depth-node ${layer === l.id ? 'active' : ''}`}
                            onClick={() => setLayer(l.id as DepthLayer)}
                        >
                            <span className="dot" />
                            <div className="label">
                                <strong>{l.label}</strong>
                                <small>{l.id === layer ? l.description : ''}</small>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            <section className="control-group">
                <label>Cognitive State</label>
                <div className="toggle-list">
                    <button className={`toggle-item ${gravityActive ? 'on' : ''}`} onClick={() => setGravityActive(!gravityActive)}>
                        Semantic Gravity
                        <span className="status">{gravityActive ? 'Engaged' : 'Idle'}</span>
                    </button>
                    <button className={`toggle-item ${reconstructionMode ? 'on' : ''}`} onClick={() => setReconstructionMode(!reconstructionMode)}>
                        Reconstruction Mode
                        <span className="status">{reconstructionMode ? 'Active' : 'Off'}</span>
                    </button>
                    <button className={`toggle-item ${density === 'light' ? 'on' : ''}`} onClick={() => setDensity(density === 'dense' ? 'light' : 'dense')}>
                        Density: {density.toUpperCase()}
                    </button>
                </div>
            </section>

            <section className="control-group friction-terrain">
                <label>Friction Terrain</label>
                <div className="terrain-grid">
                    {SOPHISTICATED_CONTENT.map(node => (
                        <div
                            key={node.id}
                            className={`terrain-cell ${frictionZones.has(node.id) ? 'marked' : ''} ${isolatedSentence === node.id ? 'focus' : ''}`}
                            onMouseEnter={() => !isolatedSentence && setIsolatedSentence(node.id)}
                            onMouseLeave={() => isolatedSentence === node.id && !reconstructionMode && setIsolatedSentence(null)}
                        />
                    ))}
                </div>
                <p className="hint">Red marks indicate cognitive resistance points.</p>
            </section>
        </div>
    );

    return (
        <div className={`arena-full-view ${isolatedSentence ? 'isolation-active' : ''}`}>
            <div className="arena-main-stage">
                <header className="arena-header">
                    <button className="back-link" onClick={onBack}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        Exit Arena
                    </button>
                    <div className="article-title-stack">
                        <h1>{article.title}</h1>
                        <div className={`load-pacer ${cognitiveStabilization > 0 ? 'active' : ''}`} style={{ width: `${cognitiveStabilization}%` }} />
                    </div>
                    <button className="compress-btn" onClick={() => setIsCompressed(!isCompressed)}>
                        {isCompressed ? 'EXPAND' : 'COMPRESS'}
                    </button>
                </header>

                <div className="reading-canvas">
                    <div className={`text-container ${isCompressed ? 'compressed' : ''} ${reconstructionMode ? 'reconstruction' : ''}`}>
                        {SOPHISTICATED_CONTENT.map((node) => {
                            const isIsolated = isolatedSentence === node.id;
                            const inFriction = frictionZones.has(node.id);

                            return (
                                <div
                                    key={node.id}
                                    className={`sentence-block ${isIsolated ? 'focused' : ''} ${inFriction ? 'friction' : ''} ${node.isBoundary ? 'boundary-edge' : ''}`}
                                    onClick={() => setIsolatedSentence(isIsolated ? null : node.id)}
                                >
                                    {node.isBoundary && <div className="meaning-boundary"><span>BOUNDARY DETECTED</span></div>}
                                    <div className="sentence-utils">
                                        <button
                                            className={`friction-flag ${inFriction ? 'active' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); toggleFriction(node.id); }}
                                        />
                                    </div>
                                    <p className="content-line">
                                        {node.content[layer].split(' ').map((word, i) => {
                                            const isGravity = node.gravityWords.some(gw => word.toLowerCase().includes(gw.toLowerCase()));
                                            return (
                                                <span
                                                    key={i}
                                                    className={`word-unit ${gravityActive && isGravity ? 'heavy-word' : ''}`}
                                                    data-word={word}
                                                >
                                                    {word}{' '}
                                                </span>
                                            );
                                        })}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {portalTarget && createPortal(controls, portalTarget)}

            <div className="arena-overlay" onClick={() => setIsolatedSentence(null)} />
        </div>
    );
};
