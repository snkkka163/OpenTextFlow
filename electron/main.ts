import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DatabaseSync } from 'node:sqlite';

let mainWindow: BrowserWindow | null;
let db: DatabaseSync | null;

const isDev = process.env.NODE_VENV === 'development' || !app.isPackaged;

function resolveAppIconPath() {
    const devIcon = path.join(process.cwd(), 'public', 'logo.png');
    const packagedIcon = path.join(app.getAppPath(), 'dist', 'logo.png');
    if (fs.existsSync(devIcon)) {
        return devIcon;
    }
    if (fs.existsSync(packagedIcon)) {
        return packagedIcon;
    }
    return undefined;
}

interface EditHistoryRecord {
    docPath: string;
    originalText: string;
    modifiedText: string;
    agentName: string;
    agentId?: string;
    prompt?: string;
}

interface AgentRecord {
    id: string;
    name: string;
    description?: string;
    systemPrompt: string;
    isDefault?: number;
}

interface AIConfigRecord {
    apiUrl: string;
    apiKey: string;
    modelName: string;
}

function getDatabase() {
    if (!db) {
        initializeDatabase();
    }
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}

function initializeDatabase() {
    try {
        const appDataDir = path.join(os.homedir(), '.open-text-flow');
        if (!fs.existsSync(appDataDir)) {
            fs.mkdirSync(appDataDir, { recursive: true });
        }

        const dbPath = path.join(appDataDir, 'opentextflow.db');
        db = new DatabaseSync(dbPath);

        // Enable foreign keys
        db.exec('PRAGMA foreign_keys = ON');

        // Create tables if they don't exist
        db.exec(`
            CREATE TABLE IF NOT EXISTS edit_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                docPath TEXT NOT NULL,
                originalText TEXT NOT NULL,
                modifiedText TEXT NOT NULL,
                agentName TEXT NOT NULL,
                agentId TEXT,
                prompt TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ai_agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                systemPrompt TEXT NOT NULL,
                isDefault INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ai_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                apiUrl TEXT NOT NULL,
                apiKey TEXT NOT NULL,
                modelName TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_edit_history_docPath ON edit_history(docPath);
            CREATE INDEX IF NOT EXISTS idx_edit_history_timestamp ON edit_history(timestamp);
            CREATE INDEX IF NOT EXISTS idx_ai_agents_is_default ON ai_agents(isDefault);
        `);

        const countRow = db
            .prepare('SELECT COUNT(*) AS count FROM ai_agents')
            .get() as { count: number };

        if (countRow.count === 0) {
            const seedStmt = db.prepare(
                `INSERT INTO ai_agents (id, name, description, systemPrompt, isDefault)
                 VALUES (?, ?, ?, ?, ?)`
            );

            seedStmt.run(
                'default-editor',
                'General Editor',
                'Default editor AI',
                'You are an expert AI text editor. Review and improve the following text based on the user instruction. Provide only the edited text, nothing else. Do not wrap the output in quotes or markdown blocks unless requested.',
                1
            );

            seedStmt.run(
                'academic-polisher',
                '学术润色助手',
                '用于提升学术文本的清晰度、自然度和表达质量。',
                'You are an academic polishing assistant. Rewrite the provided text to make it clearer, more natural, and more human-like while preserving the original meaning. Keep a formal, objective, academic tone. Use varied sentence structures and precise wording. Provide ONLY the rewritten text.',
                0
            );
        }

        // Migrate legacy built-in agent name/id if present.
        const legacyAgentId = 'aigc-reducer';
        const upgradedAgentId = 'academic-polisher';
        const upgradedAgentName = '学术润色助手';
        const upgradedAgentDescription = '用于提升学术文本的清晰度、自然度和表达质量。';
        const upgradedSystemPrompt = 'You are an academic polishing assistant. Rewrite the provided text to make it clearer, more natural, and more human-like while preserving the original meaning. Keep a formal, objective, academic tone. Use varied sentence structures and precise wording. Provide ONLY the rewritten text.';

        const legacyAgentRow = db
            .prepare('SELECT id FROM ai_agents WHERE id = ?')
            .get(legacyAgentId) as { id: string } | undefined;
        const upgradedAgentRow = db
            .prepare('SELECT id FROM ai_agents WHERE id = ?')
            .get(upgradedAgentId) as { id: string } | undefined;

        if (legacyAgentRow && upgradedAgentRow) {
            db.prepare(
                `UPDATE ai_agents
                 SET name = ?, description = ?, systemPrompt = ?
                 WHERE id = ?`
            ).run(
                upgradedAgentName,
                upgradedAgentDescription,
                upgradedSystemPrompt,
                upgradedAgentId
            );
            db.prepare('UPDATE edit_history SET agentId = ? WHERE agentId = ?')
                .run(upgradedAgentId, legacyAgentId);
            db.prepare('DELETE FROM ai_agents WHERE id = ?')
                .run(legacyAgentId);
        } else if (legacyAgentRow) {
            db.prepare(
                `UPDATE ai_agents
                 SET id = ?, name = ?, description = ?, systemPrompt = ?
                 WHERE id = ?`
            ).run(
                upgradedAgentId,
                upgradedAgentName,
                upgradedAgentDescription,
                upgradedSystemPrompt,
                legacyAgentId
            );
            db.prepare('UPDATE edit_history SET agentId = ? WHERE agentId = ?')
                .run(upgradedAgentId, legacyAgentId);
        } else if (upgradedAgentRow) {
            db.prepare(
                `UPDATE ai_agents
                 SET name = ?, description = ?, systemPrompt = ?
                 WHERE id = ?`
            ).run(
                upgradedAgentName,
                upgradedAgentDescription,
                upgradedSystemPrompt,
                upgradedAgentId
            );
        }

        console.log('Database initialized successfully');
    } catch (error: any) {
        console.error('Failed to initialize database:', error.message);
    }
}

function closeDatabase() {
    if (db) {
        try {
            db.close();
            console.log('Database closed');
        } catch (error: any) {
            console.error('Error closing database:', error.message);
        } finally {
            db = null;
        }
    }
}

function createWindow() {
    const iconPath = resolveAppIconPath();
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // For simplicity in this demo, real prod should use preload
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    app.setAppUserModelId('com.opentextflow.app');
    initializeDatabase();
    createWindow();
});

app.on('window-all-closed', () => {
    closeDatabase();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        initializeDatabase();
        createWindow();
    }
});

// IPC handlers for local files
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        filters: [{ name: 'Word Documents', extensions: ['docx'] }],
    });
    if (canceled) {
        return null;
    } else {
        return filePaths[0];
    }
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
        const data = fs.readFileSync(filePath);
        return { success: true, data: data.toString('base64') }; // Return base64 for binary files like docx
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

// IPC handlers for database operations
ipcMain.handle('db:getEditHistory', async (event, { docPath }) => {
    try {
        const database = getDatabase();

        const stmt = database.prepare(
            'SELECT * FROM edit_history WHERE docPath = ? ORDER BY timestamp DESC'
        );
        const rows = stmt.all(docPath);

        return { success: true, data: rows };
    } catch (error: any) {
        console.error('Error getting edit history:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('db:saveEditHistory', async (event, record) => {
    try {
        const historyRecord = record as EditHistoryRecord;
        if (
            !historyRecord?.docPath ||
            !historyRecord?.originalText ||
            !historyRecord?.modifiedText ||
            !historyRecord?.agentName
        ) {
            return { success: false, error: 'Missing required edit history fields' };
        }

        const database = getDatabase();

        const stmt = database.prepare(
            `INSERT INTO edit_history 
            (docPath, originalText, modifiedText, agentName, agentId, prompt, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        const result = stmt.run(
            historyRecord.docPath,
            historyRecord.originalText,
            historyRecord.modifiedText,
            historyRecord.agentName,
            historyRecord.agentId || null,
            historyRecord.prompt || null,
            new Date().toISOString()
        );

        return { success: true, id: result.lastInsertRowid };
    } catch (error: any) {
        console.error('Error saving edit history:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('db:deleteEditHistory', async (event, { id }) => {
    try {
        const database = getDatabase();

        const stmt = database.prepare('DELETE FROM edit_history WHERE id = ?');
        stmt.run(id);

        return { success: true };
    } catch (error: any) {
        console.error('Error deleting edit history:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('db:getAgents', async () => {
    try {
        const database = getDatabase();
        const stmt = database.prepare(
            'SELECT id, name, description, systemPrompt, isDefault FROM ai_agents ORDER BY created_at ASC'
        );
        const rows = stmt.all();
        return { success: true, data: rows };
    } catch (error: any) {
        console.error('Error getting agents:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('db:upsertAgent', async (event, payload) => {
    try {
        const agent = payload as AgentRecord;
        if (!agent?.id || !agent?.name || !agent?.systemPrompt) {
            return { success: false, error: 'Missing required agent fields' };
        }

        const database = getDatabase();
        const stmt = database.prepare(
            `INSERT INTO ai_agents (id, name, description, systemPrompt, isDefault)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               description = excluded.description,
               systemPrompt = excluded.systemPrompt,
               isDefault = excluded.isDefault,
               updated_at = CURRENT_TIMESTAMP`
        );

        stmt.run(
            agent.id,
            agent.name,
            agent.description || null,
            agent.systemPrompt,
            agent.id === 'default-editor' ? 1 : agent.isDefault || 0
        );

        return { success: true };
    } catch (error: any) {
        console.error('Error upserting agent:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('db:deleteAgent', async (event, { id }) => {
    try {
        if (!id) {
            return { success: false, error: 'Missing agent id' };
        }
        if (id === 'default-editor') {
            return { success: false, error: 'Cannot delete default agent' };
        }

        const database = getDatabase();
        const stmt = database.prepare('DELETE FROM ai_agents WHERE id = ?');
        stmt.run(id);

        return { success: true };
    } catch (error: any) {
        console.error('Error deleting agent:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('db:getAIConfig', async () => {
    try {
        const database = getDatabase();
        const stmt = database.prepare(
            'SELECT apiUrl, apiKey, modelName FROM ai_config WHERE id = 1'
        );
        const row = stmt.get();
        return { success: true, data: row || null };
    } catch (error: any) {
        console.error('Error getting AI config:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('db:saveAIConfig', async (event, payload) => {
    try {
        const config = payload as AIConfigRecord;
        if (!config?.apiUrl || !config?.apiKey || !config?.modelName) {
            return { success: false, error: 'Missing required AI config fields' };
        }

        const database = getDatabase();
        const stmt = database.prepare(
            `INSERT INTO ai_config (id, apiUrl, apiKey, modelName, updated_at)
             VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               apiUrl = excluded.apiUrl,
               apiKey = excluded.apiKey,
               modelName = excluded.modelName,
               updated_at = CURRENT_TIMESTAMP`
        );

        stmt.run(config.apiUrl, config.apiKey, config.modelName);

        return { success: true };
    } catch (error: any) {
        console.error('Error saving AI config:', error);
        return { success: false, error: error.message };
    }
});
