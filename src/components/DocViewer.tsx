import { useState, useEffect, useRef } from 'react';
import { Card, Button, Input, Modal, message, Spin, Select, Slider } from 'antd';
import { renderAsync } from 'docx-preview';
import { RobotOutlined, CopyOutlined } from '@ant-design/icons';
import axios from 'axios';
import { AIAgent } from './AgentConfig';
import { t } from '../i18n';

const glassStyle = {
    background: 'var(--glass-solid)',
    backdropFilter: 'blur(12px)',
    border: 'var(--mist-border)',
    borderRadius: '8px',
};

interface DocViewerProps {
    docPath: string;
}

const AI_PANEL_RATIO_KEY = 'otf_ai_panel_ratio';

type DiffSegmentType = 'equal' | 'delete' | 'insert';

interface DiffSegment {
    type: DiffSegmentType;
    text: string;
}

function getInitialAIPanelRatio() {
    const saved = localStorage.getItem(AI_PANEL_RATIO_KEY);
    if (!saved) {
        return 30;
    }
    const parsed = Number(saved);
    if (Number.isNaN(parsed)) {
        return 30;
    }
    return Math.min(45, Math.max(25, parsed));
}

function clearSearchHighlights(root: HTMLElement) {
    root.querySelectorAll('.otf-search-hit').forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) {
            return;
        }
        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
    });
}

function highlightSearchMatches(root: HTMLElement, query: string): HTMLElement[] {
    clearSearchHighlights(root);
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return [];
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const textNode = node as Text;
            if (!textNode.nodeValue || !textNode.nodeValue.trim()) {
                return NodeFilter.FILTER_REJECT;
            }
            const parentEl = textNode.parentElement;
            if (!parentEl) {
                return NodeFilter.FILTER_REJECT;
            }
            if (parentEl.closest('.otf-search-hit')) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
        textNodes.push(current as Text);
        current = walker.nextNode();
    }

    const matches: HTMLElement[] = [];

    for (const originalTextNode of textNodes) {
        let textNode = originalTextNode;
        let text = textNode.nodeValue || '';
        let lowerText = text.toLowerCase();
        let matchIndex = lowerText.indexOf(normalizedQuery);

        while (matchIndex >= 0 && textNode.parentNode) {
            const matchNode = textNode.splitText(matchIndex);
            textNode = matchNode.splitText(normalizedQuery.length);

            const mark = document.createElement('span');
            mark.className = 'otf-search-hit';
            matchNode.parentNode?.replaceChild(mark, matchNode);
            mark.appendChild(matchNode);
            matches.push(mark);

            text = textNode.nodeValue || '';
            lowerText = text.toLowerCase();
            matchIndex = lowerText.indexOf(normalizedQuery);
        }
    }

    return matches;
}

function mergeSegments(segments: DiffSegment[]) {
    const merged: DiffSegment[] = [];
    for (const segment of segments) {
        if (!segment.text) {
            continue;
        }
        const last = merged[merged.length - 1];
        if (last && last.type === segment.type) {
            last.text += segment.text;
        } else {
            merged.push({ ...segment });
        }
    }
    return merged;
}

function buildSimpleSegments(original: string, modified: string): DiffSegment[] {
    if (original === modified) {
        return [{ type: 'equal', text: original }];
    }

    let prefix = 0;
    const minLength = Math.min(original.length, modified.length);
    while (prefix < minLength && original[prefix] === modified[prefix]) {
        prefix += 1;
    }

    let suffix = 0;
    while (
        suffix < minLength - prefix &&
        original[original.length - 1 - suffix] === modified[modified.length - 1 - suffix]
    ) {
        suffix += 1;
    }

    const segments: DiffSegment[] = [];
    const prefixText = original.slice(0, prefix);
    const originalMiddle = original.slice(prefix, original.length - suffix);
    const modifiedMiddle = modified.slice(prefix, modified.length - suffix);
    const suffixText = original.slice(original.length - suffix);

    if (prefixText) {
        segments.push({ type: 'equal', text: prefixText });
    }
    if (originalMiddle) {
        segments.push({ type: 'delete', text: originalMiddle });
    }
    if (modifiedMiddle) {
        segments.push({ type: 'insert', text: modifiedMiddle });
    }
    if (suffixText) {
        segments.push({ type: 'equal', text: suffixText });
    }

    return mergeSegments(segments);
}

function buildInlineDiffSegments(original: string, modified: string): DiffSegment[] {
    const oldChars = Array.from(original);
    const newChars = Array.from(modified);
    const n = oldChars.length;
    const m = newChars.length;

    if (n === 0 && m === 0) {
        return [];
    }

    // Avoid heavy O(n*m) memory for long text.
    if (n * m > 2_000_000) {
        return buildSimpleSegments(original, modified);
    }

    const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            if (oldChars[i] === newChars[j]) {
                dp[i][j] = dp[i + 1][j + 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }

    const segments: DiffSegment[] = [];
    let i = 0;
    let j = 0;

    while (i < n && j < m) {
        if (oldChars[i] === newChars[j]) {
            segments.push({ type: 'equal', text: oldChars[i] });
            i += 1;
            j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            segments.push({ type: 'delete', text: oldChars[i] });
            i += 1;
        } else {
            segments.push({ type: 'insert', text: newChars[j] });
            j += 1;
        }
    }

    while (i < n) {
        segments.push({ type: 'delete', text: oldChars[i] });
        i += 1;
    }

    while (j < m) {
        segments.push({ type: 'insert', text: newChars[j] });
        j += 1;
    }

    return mergeSegments(segments);
}

export default function DocViewer({ docPath }: DocViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedRangeRef = useRef<Range | null>(null);
    const mouseUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
    const searchInputRef = useRef<any>(null);
    const searchMatchesRef = useRef<HTMLElement[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedText, setSelectedText] = useState('');
    const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);
    const [suggestionBaseText, setSuggestionBaseText] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [processingAi, setProcessingAi] = useState(false);
    const [agents, setAgents] = useState<AIAgent[]>([]);
    const [selectedAgentId, setSelectedAgentId] = useState<string>('default-editor');
    const [aiPanelRatio, setAiPanelRatio] = useState<number>(getInitialAIPanelRatio);
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
    const [searchTotal, setSearchTotal] = useState(0);

    useEffect(() => {
        localStorage.setItem(AI_PANEL_RATIO_KEY, String(aiPanelRatio));
    }, [aiPanelRatio]);

    const jumpToSearchMatch = (index: number) => {
        const matches = searchMatchesRef.current;
        if (matches.length === 0) {
            setSearchActiveIndex(-1);
            return;
        }

        const normalizedIndex = (index + matches.length) % matches.length;
        matches.forEach((el) => el.classList.remove('otf-search-hit-active'));
        const active = matches[normalizedIndex];
        active.classList.add('otf-search-hit-active');
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setSearchActiveIndex(normalizedIndex);
    };

    const refreshSearch = (query: string) => {
        if (!containerRef.current) {
            setSearchTotal(0);
            setSearchActiveIndex(-1);
            return;
        }
        const matches = highlightSearchMatches(containerRef.current, query);
        searchMatchesRef.current = matches;
        setSearchTotal(matches.length);
        if (matches.length > 0) {
            jumpToSearchMatch(0);
        } else {
            setSearchActiveIndex(-1);
        }
    };

    const markEditedRange = (range: Range | null) => {
        if (!range || !containerRef.current) {
            return;
        }
        if (!containerRef.current.contains(range.commonAncestorContainer)) {
            return;
        }
        const wrapper = document.createElement('span');
        wrapper.className = 'otf-ai-edited-highlight';

        try {
            range.surroundContents(wrapper);
        } catch {
            try {
                const fragment = range.extractContents();
                wrapper.appendChild(fragment);
                range.insertNode(wrapper);
            } catch {
                // Ignore highlight failure for complex cross-element ranges.
            }
        }
    };

    useEffect(() => {
        if (
            aiSuggestions &&
            suggestionBaseText &&
            selectedText &&
            selectedText !== suggestionBaseText
        ) {
            setAiSuggestions(null);
            setSuggestionBaseText(null);
        }
    }, [selectedText, aiSuggestions, suggestionBaseText]);

    useEffect(() => {
        const handleGlobalKeydown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                setSearchVisible(true);
                window.setTimeout(() => {
                    searchInputRef.current?.focus?.();
                    searchInputRef.current?.select?.();
                }, 0);
            }
        };

        window.addEventListener('keydown', handleGlobalKeydown);
        return () => window.removeEventListener('keydown', handleGlobalKeydown);
    }, []);

    const loadAgents = async () => {
        try {
            const electron = window.require ? window.require('electron') : null;
            if (!electron) {
                return;
            }

            const result = await electron.ipcRenderer.invoke('db:getAgents');
            if (!result.success) {
                message.error(`${t('agent.loadError')}: ${result.error}`);
                return;
            }

            const loadedAgents = (result.data || []) as AIAgent[];
            setAgents(loadedAgents);

            if (
                loadedAgents.length > 0 &&
                !loadedAgents.find((a) => a.id === selectedAgentId)
            ) {
                setSelectedAgentId(loadedAgents[0].id);
            }
        } catch (error: any) {
            message.error(`${t('agent.loadError')}: ${error.message}`);
        }
    };

    useEffect(() => {
        void loadAgents();
        if (!docPath) return;

        const loadDoc = async () => {
            setLoading(true);
            try {
                const electron = window.require ? window.require('electron') : null;
                if (electron && containerRef.current) {
                    const response = await electron.ipcRenderer.invoke('fs:readFile', docPath);
                    if (response.success) {
                        // Buffer from base64
                        const buffer = new Uint8Array(atob(response.data).split('').map((char: string) => char.charCodeAt(0)));
                        await renderAsync(buffer, containerRef.current, undefined, {
                            className: 'docx-viewer-content', // custom class if needed
                            inWrapper: true,
                            breakPages: true,
                            ignoreWidth: false,
                            ignoreHeight: false,
                            ignoreLastRenderedPageBreak: false,
                            renderHeaders: true,
                            renderFooters: true,
                            renderFootnotes: true,
                            renderEndnotes: true,
                            experimental: true,
                        });
                        setupSelectionListener();
                        refreshSearch(searchQuery);
                    } else {
                        message.error(t('doc.loadingError') + response.error);
                    }
                } else {
                    message.warning("Electron context not found!");
                }
            } catch (err: any) {
                message.error(t('doc.renderError') + err.message);
            } finally {
                setLoading(false);
            }
        };
        void loadDoc();
    }, [docPath]);

    const setupSelectionListener = () => {
        if (!containerRef.current) {
            return;
        }

        if (mouseUpHandlerRef.current) {
            containerRef.current.removeEventListener('mouseup', mouseUpHandlerRef.current);
        }

        const handleMouseUp = () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.toString().trim().length === 0) {
                setSelectedText('');
                selectedRangeRef.current = null;
                return;
            }

            const range = selection.getRangeAt(0);
            if (!containerRef.current?.contains(range.commonAncestorContainer)) {
                setSelectedText('');
                selectedRangeRef.current = null;
                return;
            }

            selectedRangeRef.current = range.cloneRange();
            setSelectedText(selection.toString());
        };

        mouseUpHandlerRef.current = handleMouseUp;
        containerRef.current.addEventListener('mouseup', handleMouseUp);
    };

    const handleAIEdit = async () => {
        if (!selectedText) {
            message.warning(t('doc.selectTextFirst'));
            return;
        }

        const sourceText = selectedText;
        const selectedRangeSnapshot = selectedRangeRef.current
            ? selectedRangeRef.current.cloneRange()
            : null;

        const electron = window.require ? window.require('electron') : null;
        if (!electron) {
            message.error('Electron context not found');
            return;
        }

        const configResult = await electron.ipcRenderer.invoke('db:getAIConfig');
        if (!configResult.success || !configResult.data) {
            message.error(t('doc.configureAI'));
            return;
        }

        const config = configResult.data as {
            apiUrl: string;
            apiKey: string;
            modelName: string;
        };

        setProcessingAi(true);

        const currentAgent = agents.find(a => a.id === selectedAgentId) || agents[0];
        const systemInstruction = currentAgent?.systemPrompt
            ? `${currentAgent.systemPrompt}\nUser Instruction: ${prompt || 'Apply the role\'s expertise.'}`
            : `You are an AI text editor. Review and improve the following text based on this instruction: ${prompt || 'Improve clarity and flow'}. Provide only the edited text, nothing else.`;

        try {
            // Format URL to ensure it doesn't double-slash or missing v1 if common
            const baseUrl = config.apiUrl.replace(/\/$/, "");
            const endpoint = baseUrl.endsWith('/v1') || baseUrl.includes('/chat/completions')
                ? `${baseUrl}/chat/completions`.replace('/chat/completions/chat/completions', '/chat/completions')
                : `${baseUrl}/v1/chat/completions`;

            // Standard OpenAI-compatible format
            const res = await axios.post(endpoint, {
                model: config.modelName,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: sourceText }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = res.data?.data || res.data; // Handle wrapped proxy responses

            if (data && data.choices && data.choices.length > 0) {
                const aiResult = data.choices[0].message?.content || data.choices[0].text; // Fallback for some models
                if (aiResult) {
                    markEditedRange(selectedRangeSnapshot);
                    setAiSuggestions(aiResult);
                    setSuggestionBaseText(sourceText);
                    await saveEditHistory(sourceText, aiResult, currentAgent);
                } else {
                    message.error(t('message.responseFormatError'));
                }
            } else {
                console.error("Unexpected AI response:", res.data);
                Modal.error({
                    title: t('message.unexpectedResponse'),
                    content: <div style={{ wordWrap: 'break-word' }}>{JSON.stringify(res.data)}</div>
                });
            }
        } catch (err: any) {
            console.error("AI Error:", err.response?.data || err);
            const errDetail = err.response?.data?.error?.message || JSON.stringify(err.response?.data) || err.message;
            Modal.error({ title: t('message.apiError'), content: errDetail });
        } finally {
            setProcessingAi(false);
        }
    };

    const saveEditHistory = async (original: string, updated: string, agent?: AIAgent) => {
        const electron = window.require ? window.require('electron') : null;
        if (!electron) {
            message.error('Electron context not found');
            return;
        }

        const result = await electron.ipcRenderer.invoke('db:saveEditHistory', {
            docPath,
            originalText: original,
            modifiedText: updated,
            agentName: agent?.name || 'Unknown Agent',
            agentId: agent?.id,
            prompt: prompt || null,
        });

        if (!result.success) {
            message.error(`${t('history.saveError')}: ${result.error}`);
            return;
        }

        message.success(t('doc.editSavedSuccess'));
    };

    const handleCopySuggestion = async () => {
        if (!aiSuggestions) {
            return;
        }

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(aiSuggestions);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = aiSuggestions;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            message.success(t('doc.copySuccess'));
        } catch {
            message.error(t('doc.copyError'));
        }
    };

    const inlineDiffSegments = aiSuggestions
        ? buildInlineDiffSegments(suggestionBaseText || selectedText, aiSuggestions)
        : [];

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>

            {/* Left Side: Word Viewer */}
            <div style={{ width: `${100 - aiPanelRatio}%`, overflowY: 'auto', ...glassStyle, padding: '24px' }}>
                {searchVisible && (
                    <div
                        style={{
                            marginBottom: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'var(--glass-soft)',
                            border: '1px solid rgba(63, 138, 95, 0.24)',
                            borderRadius: '8px',
                            padding: '8px',
                            position: 'sticky',
                            top: 0,
                            zIndex: 12
                        }}
                    >
                        <Input
                            ref={searchInputRef}
                            value={searchQuery}
                            placeholder={t('doc.searchPlaceholder')}
                            onChange={(e) => {
                                const nextQuery = e.target.value;
                                setSearchQuery(nextQuery);
                                refreshSearch(nextQuery);
                            }}
                            onPressEnter={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                if (searchTotal === 0) {
                                    return;
                                }
                                const delta = e.shiftKey ? -1 : 1;
                                jumpToSearchMatch(searchActiveIndex + delta);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    setSearchVisible(false);
                                    if (containerRef.current) {
                                        clearSearchHighlights(containerRef.current);
                                    }
                                    searchMatchesRef.current = [];
                                    setSearchQuery('');
                                    setSearchTotal(0);
                                    setSearchActiveIndex(-1);
                                }
                            }}
                            size="small"
                        />
                        <div style={{ minWidth: '72px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {searchTotal > 0 ? `${searchActiveIndex + 1}/${searchTotal}` : t('doc.searchNoResult')}
                        </div>
                        <Button
                            size="small"
                            onClick={() => jumpToSearchMatch(searchActiveIndex - 1)}
                            disabled={searchTotal === 0}
                        >
                            鈫?                        </Button>
                        <Button
                            size="small"
                            onClick={() => jumpToSearchMatch(searchActiveIndex + 1)}
                            disabled={searchTotal === 0}
                        >
                            鈫?                        </Button>
                        <Button
                            size="small"
                            onClick={() => {
                                setSearchVisible(false);
                                if (containerRef.current) {
                                    clearSearchHighlights(containerRef.current);
                                }
                                searchMatchesRef.current = [];
                                setSearchQuery('');
                                setSearchTotal(0);
                                setSearchActiveIndex(-1);
                            }}
                        >
                            {t('doc.dismiss')}
                        </Button>
                    </div>
                )}
                <Spin spinning={loading} tip={t('doc.loadingDocument')}>
                    <div
                        ref={containerRef}
                        style={{
                            minHeight: '100%',
                            padding: '8px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '16px'
                        }}
                    />
                </Spin>
            </div>

            {/* Right Side: AI Agent panel */}
            <div style={{ width: `${aiPanelRatio}%`, minWidth: '300px', ...glassStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid rgba(63, 138, 95, 0.2)', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', color: 'var(--text-primary)' }}>
                    <RobotOutlined style={{ marginRight: '8px', color: 'var(--forest-700)' }} /> AI Agent
                </div>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(63, 138, 95, 0.14)', background: 'rgba(238, 249, 242, 0.35)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        <span>{t('doc.layoutRatio')}</span>
                        <span>{`${100 - aiPanelRatio}% / ${aiPanelRatio}%`}</span>
                    </div>
                    <Slider
                        min={25}
                        max={45}
                        step={1}
                        value={aiPanelRatio}
                        onChange={(value: number) => setAiPanelRatio(value)}
                        tooltip={{ formatter: (value) => `${t('doc.aiPanelWidth')}: ${value}%` }}
                    />
                </div>
                <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
                    {!selectedText && !aiSuggestions && (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px' }}>
                            {t('doc.selectToStart')}
                        </div>
                    )}

                    {selectedText && (
                        <Card style={{ marginBottom: 16, borderLeft: '4px solid var(--forest-700)', background: 'var(--glass-soft)' }} size="small" title={t('doc.selectedText')}>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: 16, maxHeight: '150px', overflowY: 'auto' }}>
                                {selectedText}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <Select
                                    value={selectedAgentId}
                                    onChange={setSelectedAgentId}
                                    onDropdownVisibleChange={(open: boolean) => { if (open) void loadAgents(); }}
                                    onClick={loadAgents}
                                    options={agents.map(a => ({ label: a.name, value: a.id }))}
                                    style={{ width: '100%', borderRadius: '6px' }}
                                />
                                <Input.TextArea
                                    placeholder={t('doc.instruction')}
                                    value={prompt}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                    style={{ borderRadius: '6px' }}
                                />
                                <Button type="primary" onClick={handleAIEdit} loading={processingAi} block style={{ background: 'linear-gradient(135deg, var(--forest-700) 0%, var(--forest-600) 100%)', border: 'none', borderRadius: '6px' }}>
                                    {t('doc.generateEdit')}
                                </Button>
                            </div>
                        </Card>
                    )}

                    {aiSuggestions && (
                        <Card size="small" title={t('doc.aiSuggestion')} style={{ borderLeft: '4px solid var(--forest-600)', background: 'var(--glass-soft)' }}>
                            <Spin spinning={processingAi}>
                                <div style={{ maxHeight: '400px', overflowY: 'auto', fontSize: '14px' }}>
                                    <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                        {t('doc.inlineDiffLabel')}
                                    </div>
                                    <div
                                        style={{
                                            whiteSpace: 'pre-wrap',
                                            lineHeight: 1.8,
                                            background: 'var(--doc-surface)',
                                            border: '1px solid rgba(63, 138, 95, 0.2)',
                                            borderRadius: '8px',
                                            padding: '12px'
                                        }}
                                    >
                                        {inlineDiffSegments.map((segment, index) => {
                                            if (segment.type === 'delete') {
                                                return (
                                                    <span
                                                        key={`${segment.type}-${index}`}
                                                        style={{
                                                            color: '#cf1322',
                                                            textDecoration: 'line-through',
                                                            textDecorationThickness: '1.5px',
                                                            background: 'rgba(255, 77, 79, 0.14)',
                                                            borderRadius: '3px'
                                                        }}
                                                    >
                                                        {segment.text}
                                                    </span>
                                                );
                                            }
                                            if (segment.type === 'insert') {
                                                return (
                                                    <span
                                                        key={`${segment.type}-${index}`}
                                                        style={{
                                                            color: '#135200',
                                                            background: 'rgba(82, 196, 26, 0.22)',
                                                            borderRadius: '3px'
                                                        }}
                                                    >
                                                        {segment.text}
                                                    </span>
                                                );
                                            }
                                            return <span key={`${segment.type}-${index}`}>{segment.text}</span>;
                                        })}
                                    </div>
                                </div>
                            </Spin>
                            <div style={{ marginTop: '16px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <Button icon={<CopyOutlined />} onClick={handleCopySuggestion} style={{ borderRadius: '6px' }}>
                                    {t('doc.copyEditedText')}
                                </Button>
                                <Button
                                    onClick={() => {
                                        setAiSuggestions(null);
                                        setSuggestionBaseText(null);
                                        setSelectedText('');
                                    }}
                                    style={{ borderRadius: '6px' }}
                                >
                                    {t('doc.dismiss')}
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

