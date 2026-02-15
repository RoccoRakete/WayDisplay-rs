import { useState, useEffect, useRef } from "react";
import { FaGithub, FaBug, FaCheck, FaRegClipboard } from "react-icons/fa";
import { invoke } from "@tauri-apps/api/core";
import { message } from '@tauri-apps/plugin-dialog';
import { exit } from '@tauri-apps/plugin-process';
import "./App.css";
import { DisplayLayout } from './DisplayLayout';

// Interfaces matching wlr-randr JSON structure
interface DisplayMode {
  width: number;
  height: number;
  refresh: number;
  preferred: boolean;
  current: boolean;
}

interface Display {
  name: string;
  description: string;
  make: string;
  model: string;
  serial: string;
  enabled: boolean;
  adaptive_sync: boolean;
  scale: number;
  modes: DisplayMode[];
  physical_size: {
    width: number;
    height: number;
  };
  position?: {
    x: number;
    y: number;
  };
}

function App() {

  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    async function checkDependencies() {
      try {
        const isAvailable = await invoke('check_wlr_randr', { program: 'wlr-randr' });

        if (!isAvailable) {
          await message(
            'wlr-randr was not found!\nCheck if wlr-randr is executable!',
            {
              title: 'Program not found!',
              kind: 'error'
            }
          );
          await exit(1);
        } else {
          console.log('found wlr-randr');
        }
      } catch (error) {
        console.error('Error:', error);
        await exit(1);
      }
    }

    checkDependencies();
  }, []);


  const [displays, setDisplays] = useState<Display[]>([]);
  const [selectedDisplayIndex, setSelectedDisplayIndex] = useState<number>(0);
  const [selectedResIndex, setSelectedResIndex] = useState<number>(0);

  // States for the settings in Column 3
  const [isEnabled, setIsEnabled] = useState(true);
  const [isAdaptiveSync, setIsAdaptiveSync] = useState(false);
  const [scaling, setScaling] = useState("1.0");

  // Fetch displays on start
  useEffect(() => {
    async function fetchDisplays() {
      try {
        const data: Display[] = await invoke("get_display_info");
        setDisplays(data);
        updateLocalSettings(data, 0);
      } catch (err) {
        console.error("Failed to fetch display info:", err);
      }
    }
    fetchDisplays();
  }, []);

  // Helper to sync checkboxes when display selection changes
  const updateLocalSettings = (allDisplays: Display[], index: number) => {
    const d = allDisplays[index];
    if (d) {
      setIsEnabled(d.enabled);
      setIsAdaptiveSync(d.adaptive_sync);
      setScaling(d.scale.toString());
      // Find current mode for this specific display
      const currentModeIdx = d.modes.findIndex(m => m.current);
      setSelectedResIndex(currentModeIdx !== -1 ? currentModeIdx : 0);
    }
  };

  const handleDisplayChange = (index: number) => {
    setSelectedDisplayIndex(index);
    updateLocalSettings(displays, index);
  };

  const currentDisplay = displays[selectedDisplayIndex];
  const currentMode = currentDisplay?.modes[selectedResIndex];

  // Builder for the command output
  const generatedCommand = currentDisplay && currentMode
    ? (() => {
      let posRelativeTo: string | null = null;
      let posDirection: string | null = null;

      if (displays.length > 1 && currentDisplay.position) {
        const otherDisplays = displays.filter(d => d.name !== currentDisplay.name);

        for (const other of otherDisplays) {
          if (!other.position) continue;

          const deltaX = currentDisplay.position.x - other.position.x;
          const deltaY = currentDisplay.position.y - other.position.y;

          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) {
              posRelativeTo = other.name;
              posDirection = "right-of";
              break;
            } else if (deltaX < 0) {
              posRelativeTo = other.name;
              posDirection = "left-of";
              break;
            }
          } else {
            if (deltaY > 0) {
              posRelativeTo = other.name;
              posDirection = "below";
              break;
            } else if (deltaY < 0) {
              posRelativeTo = other.name;
              posDirection = "above";
              break;
            }
          }
        }
      }

      const posArg = posRelativeTo && posDirection
        ? `--${posDirection} ${posRelativeTo} \\\n  `
        : '';

      return `wlr-randr --output ${currentDisplay.name} \\
  --mode ${currentMode.width}x${currentMode.height}@${currentMode.refresh.toFixed(3)} \\
  --scale ${scaling || "1.0"} \\
  ${posArg}--adaptive-sync ${isAdaptiveSync ? "enabled" : "disabled"} \\
  ${isEnabled ? "--on" : "--off"}`;
    })()
    : "Loading command...";

  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!generatedCommand) return;

    try {
      await navigator.clipboard.writeText(generatedCommand);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1000);

    } catch (err) {
      console.error("Failed to copy command:", err);
    }
  }

  async function handleApply() {
    const display = displays[selectedDisplayIndex];
    const mode = display?.modes[selectedResIndex];

    if (!display || !mode) return;

    try {
      // Berechne relative Position basierend auf dem Drag & Drop Layout
      let positionRelativeTo: string | null = null;
      let positionDirection: string | null = null;

      if (displays.length > 1 && display.position) {
        // Finde den nächsten Monitor basierend auf der Position
        const otherDisplays = displays.filter(d => d.name !== display.name);

        for (const other of otherDisplays) {
          if (!other.position) continue;

          const deltaX = display.position.x - other.position.x;
          const deltaY = display.position.y - other.position.y;

          // Bestimme Richtung basierend auf größtem Delta
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal
            if (deltaX > 0) {
              positionRelativeTo = other.name;
              positionDirection = "right-of";
              break;
            } else if (deltaX < 0) {
              positionRelativeTo = other.name;
              positionDirection = "left-of";
              break;
            }
          } else {
            // Vertikal
            if (deltaY > 0) {
              positionRelativeTo = other.name;
              positionDirection = "below";
              break;
            } else if (deltaY < 0) {
              positionRelativeTo = other.name;
              positionDirection = "above";
              break;
            }
          }
        }
      }

      const result = await invoke("apply_settings", {
        settings: {
          display_name: display.name,
          width: mode.width,
          height: mode.height,
          refresh: mode.refresh,
          adaptive_sync: isAdaptiveSync,
          enabled: isEnabled,
          scaling: parseFloat(scaling) || 1.0,
          position_relative_to: positionRelativeTo,
          position_direction: positionDirection,
        }
      });
      console.log(result);
    } catch (err) {
      console.error(err);
      alert(`Error: ${err}`);
    }
  }

  const handlePositionChange = (displayName: string, x: number, y: number) => {
    setDisplays(prevDisplays =>
      prevDisplays.map(d =>
        d.name === displayName
          ? { ...d, position: { x, y } }
          : d
      )
    );
  };

  return (
    <main className="main-container">
      {/* ... Header ... */}
      <header className="top-header">
        <h1>
          Display: <span className="highlight-text">
            {currentDisplay ? `${currentDisplay.name} (${currentDisplay.make} ${currentDisplay.model})` : "Loading..."}
          </span>
        </h1>
      </header>

      <div className="four-col-grid">
        {/* Column 1: Display List */}
        <section className="column-card">
          <h2>Displays</h2>
          <ul className="item-list">
            {displays.map((d, i) => (
              <li
                key={d.name}
                className={selectedDisplayIndex === i ? "active" : ""}
                onClick={() => handleDisplayChange(i)}
              >
                {d.name} <small style={{ opacity: 0.6 }}>({d.make} {d.model})</small>
              </li>
            ))}
          </ul>
        </section>

        {/* Column 2: Resolutions of the selected display */}
        <section className="column-card">
          <h2>Resolutions</h2>
          <ul className="item-list">
            {currentDisplay?.modes.map((mode, i) => (
              <li
                key={`${mode.width}-${mode.height}-${mode.refresh}-${i}`}
                className={selectedResIndex === i ? "active" : ""}
                onClick={() => setSelectedResIndex(i)}
              >
                {mode.width} x {mode.height}
                <span style={{ float: 'right', fontSize: '0.8em' }}>{mode.refresh.toFixed(2)}Hz</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Column 3: Settings (Updated with controlled inputs) */}
        <section className="column-card">
          <h2>Settings</h2>
          <div className="checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
              />
              Enabled
            </label>
            <label>
              <input
                type="checkbox"
                checked={isAdaptiveSync}
                onChange={(e) => setIsAdaptiveSync(e.target.checked)}
              />
              Adaptive Sync
            </label>
            <h3>Scaling</h3>
            <input
              type="text"
              className="system-input"
              placeholder="e.g. 1.0"
              value={scaling}
              onChange={(e) => setScaling(e.target.value)}
            />
            <h3>Layout</h3>
            <DisplayLayout
              displays={displays}
              onPositionChange={handlePositionChange}
              selectedDisplayName={currentDisplay?.name}
            />
          </div>
        </section>

        {/* Column 4: Info & Apply */}
        <section className="column-card action-column">
          <h2>Info</h2>
          <div className="info-box">
            <p><strong>Name:</strong> {currentDisplay?.name}</p>
            <p><strong>Serial:</strong> {currentDisplay?.serial || "N/A"}</p>
            <p><strong>Size:</strong> {currentDisplay?.physical_size.width}x{currentDisplay?.physical_size.height}mm</p>
          </div>

          <h3 style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '20px' }}>Command to run</h3>
          <div className="info-box command-preview">
            <pre>
              {generatedCommand}
            </pre>
          </div>

          <button
            onClick={handleCopy}
            className="cpy-btn"
          >
            {copied ? (
              <>
                <FaCheck size={22} />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <FaRegClipboard size={22} />
                <span>Copy to Clipboard</span>
              </>
            )}
          </button>

          <button
            onClick={handleApply}
            className="apply-btn"
          >Apply
          </button>

        </section>
      </div>

      <footer className="app-footer">
        <a href="https://github.com/your-repo" target="_blank" className="github-link">
          <FaGithub size={20} />
          <span>View Source</span>
        </a>
        <a href="https://github.com/your-repo" target="_blank" className="bug-link">
          <FaBug size={20} />
          <span>Report a Bug!</span>
        </a>
      </footer>
    </main >
  );
}

export default App;
