import { } from 'react';

export type Article = {
    id: string;
    title: string;
    excerpt: string;
    level: string;
    band: string;
    wordCount: number;
};

const SAMPLE_ARTICLES: Article[] = [
    {
        id: 'art-1',
        title: 'The Silent Architecture of Meaning',
        excerpt: 'Exploring how linguistic structures create depth beyond literal translation.',
        level: 'Advanced',
        band: '8.0',
        wordCount: 1200,
    },
    {
        id: 'art-2',
        title: 'Cognitive Load in Modern Reading',
        excerpt: 'How digital environments reshape our ability to focus on complex texts.',
        level: 'Intermediate',
        band: '7.0',
        wordCount: 850,
    },
    {
        id: 'art-3',
        title: 'The Evolution of Narrative Velocity',
        excerpt: 'Tracing the shift from Victorian pacing to contemporary compression.',
        level: 'Expert',
        band: '9.0',
        wordCount: 1540,
    },
];

export const ArenaList = ({ onSelect }: { onSelect: (article: Article) => void }) => {
    return (
        <div className="arena-list-view section-stack">
            <div className="arena-hero">
                <div className="eyebrow">The Arena</div>
                <h1>Choose your challenge.</h1>
                <p>Enter a high-fidelity reading environment designed for deep semantic reconstruction.</p>
            </div>

            <div className="article-grid">
                {SAMPLE_ARTICLES.map((art) => (
                    <article key={art.id} className="card article-card" onClick={() => onSelect(art)}>
                        <div className="card-tag">{art.level}</div>
                        <div className="article-meta">
                            <span className="band-score">Target Band {art.band}</span>
                            <span className="word-count">{art.wordCount} words</span>
                        </div>
                        <h3>{art.title}</h3>
                        <p>{art.excerpt}</p>
                        <button className="mini-cta" type="button">Enter Arena</button>
                    </article>
                ))}
            </div>
        </div>
    );
};
