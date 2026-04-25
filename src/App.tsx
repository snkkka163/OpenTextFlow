import { useEffect, useState } from 'react';
import { Button, Layout, message, Modal, Select, Divider } from 'antd';
import { FileWordOutlined, SettingOutlined, RobotOutlined, GlobalOutlined, HistoryOutlined, BgColorsOutlined } from '@ant-design/icons';
import AIConfig from './components/AIConfig';
import DocViewer from './components/DocViewer';
import AgentConfig from './components/AgentConfig';
import EditHistoryViewer from './components/EditHistoryViewer';
import appLogo from './assets/logo.svg';
import { t, setLanguage, initI18n } from './i18n';

const { Header, Content } = Layout;

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'ui_theme_mode';

function getInitialTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return saved === 'dark' ? 'dark' : 'light';
}

const glassStyle = {
  background: 'var(--glass-solid)',
  backdropFilter: 'blur(12px)',
  border: 'var(--mist-border)',
  boxShadow: '0 10px 32px 0 rgba(24, 58, 40, 0.14)',
};

function App() {
  const [docPath, setDocPath] = useState<string | null>(null);
  const [configVisible, setConfigVisible] = useState(false);
  const [agentConfigVisible, setAgentConfigVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [language, setLanguageState] = useState<string>(initI18n());
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleOpenFile = async () => {
    // @ts-ignore
    const electron = window.require ? window.require('electron') : null;
    if (electron) {
      const path = await electron.ipcRenderer.invoke('dialog:openFile');
      if (path) {
        setDocPath(path);
        message.success(t('app.pleaseOpenDocument'));
      }
    } else {
      message.warning("Electron context not found!");
    }
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang as 'zh_CN' | 'en_US');
    setLanguageState(lang);
  };

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden', background: 'transparent' }}>
      <Header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...glassStyle,
        borderBottom: 'none',
        padding: '0 24px',
        height: '72px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={appLogo}
            alt="OpenTextFlow Logo"
            style={{ width: '36px', height: '36px', objectFit: 'contain' }}
          />
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', textShadow: '0 1px 0 rgba(255,255,255,0.35)' }}>
            {t('app.title')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Button
            type="primary"
            icon={<FileWordOutlined />}
            onClick={handleOpenFile}
            style={{
              background: 'linear-gradient(135deg, var(--forest-700) 0%, var(--forest-600) 100%)',
              border: 'none',
              fontWeight: 500,
            }}
          >
            {t('app.openDocument')}
          </Button>
          <Button
            icon={<RobotOutlined />}
            onClick={() => setAgentConfigVisible(true)}
            style={{
              ...glassStyle,
              color: 'var(--forest-700)',
              fontWeight: 500,
            }}
          >
            {t('app.agentProfiles')}
          </Button>
          <Button
            icon={<SettingOutlined />}
            onClick={() => setConfigVisible(true)}
            style={{
              ...glassStyle,
              color: 'var(--forest-700)',
              fontWeight: 500,
            }}
          >
            {t('app.aiSettings')}
          </Button>
          <Button
            icon={<HistoryOutlined />}
            onClick={() => {
              if (!docPath) {
                message.warning(t('history.openDocumentFirst'));
                return;
              }
              setHistoryVisible(true);
            }}
            style={{
              ...glassStyle,
              color: 'var(--forest-700)',
              fontWeight: 500,
            }}
          >
            {t('history.editHistory')}
          </Button>

          <Divider type="vertical" style={{ borderColor: 'rgba(63, 138, 95, 0.2)', height: '32px' }} />

          <Select
            value={theme}
            onChange={(value) => setTheme(value as ThemeMode)}
            style={{ width: '130px' }}
            options={[
              { label: t('theme.light'), value: 'light' },
              { label: t('theme.dark'), value: 'dark' }
            ]}
            suffixIcon={<BgColorsOutlined style={{ color: 'var(--forest-700)' }} />}
          />

          <Select
            value={language}
            onChange={handleLanguageChange}
            style={{ width: '100px' }}
            options={[
              { label: '中文', value: 'zh_CN' },
              { label: 'English', value: 'en_US' }
            ]}
            suffixIcon={<GlobalOutlined style={{ color: 'var(--forest-700)' }} />}
          />
        </div>
      </Header>
      <Content style={{ display: 'flex', height: 'calc(100vh - 72px)', padding: '16px', gap: '16px' }}>
        {docPath ? (
          <DocViewer docPath={docPath} key={language} />
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'var(--text-secondary)',
            fontSize: '18px',
            background: glassStyle.background,
            backdropFilter: glassStyle.backdropFilter,
            border: glassStyle.border,
            borderRadius: '12px'
          }}>
            {t('app.pleaseOpenDocument')}
          </div>
        )}
      </Content>
      <Modal
        open={configVisible}
        onCancel={() => setConfigVisible(false)}
        footer={null}
        title={t('config.aiConfiguration')}
        style={{ borderRadius: '12px' }}
      >
        <AIConfig onSave={() => setConfigVisible(false)} />
      </Modal>
      <Modal
        open={agentConfigVisible}
        onCancel={() => setAgentConfigVisible(false)}
        footer={null}
        title={t('agent.config')}
        width={800}
        destroyOnClose
        style={{ borderRadius: '12px' }}
      >
        <AgentConfig />
      </Modal>
      {docPath && (
        <EditHistoryViewer
          docPath={docPath}
          open={historyVisible}
          onClose={() => setHistoryVisible(false)}
        />
      )}
    </Layout>
  );
}

export default App;
