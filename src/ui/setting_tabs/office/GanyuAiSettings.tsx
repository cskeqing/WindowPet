import { memo, useCallback, useEffect, useState } from "react";
import {
    Stack,
    Group,
    Text,
    Paper,
    NumberInput,
    Switch,
    Collapse,
    UnstyledButton,
    TextInput,
    PasswordInput,
    Modal,
    Button,
    List,
    Alert,
} from "@mantine/core";
import {
    IconChevronDown,
    IconSparkles,
    IconShieldLock,
    IconAlertCircle,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useGanyuSettings } from "../../../hooks/useGanyuSettings";

let ganyuTimer: ReturnType<typeof setTimeout> | null = null;

function GanyuAiSettings() {
    const { t } = useTranslation();

    const aiEnabled = useGanyuSettings(s => s.aiEnabled);
    const endpoint = useGanyuSettings(s => s.endpoint);
    const model = useGanyuSettings(s => s.model);
    const timeoutMs = useGanyuSettings(s => s.timeoutMs);
    const longWorkThresholdSeconds = useGanyuSettings(s => s.longWorkThresholdSeconds);
    const disclosureShown = useGanyuSettings(s => s.disclosureShown);
    const loadSettings = useGanyuSettings(s => s.loadSettings);
    const updateSettings = useGanyuSettings(s => s.updateSettings);
    const enableAi = useGanyuSettings(s => s.enableAi);
    const maskedApiKey = useGanyuSettings(s => s.maskedApiKey);

    const [opened, setOpened] = useState(false);
    const [disclosureOpen, setDisclosureOpen] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);

    // API key local editing state. We never bind the input to the stored
    // plaintext key; when not editing we show the masked form (Req 8.6).
    const [editingKey, setEditingKey] = useState(false);
    const [keyDraft, setKeyDraft] = useState("");

    useEffect(() => { loadSettings(); }, [loadSettings]);

    // Debounced persistence for text/number fields.
    const debouncedUpdate = useCallback((partial: Parameters<typeof updateSettings>[0]) => {
        if (ganyuTimer) clearTimeout(ganyuTimer);
        ganyuTimer = setTimeout(() => { updateSettings(partial).catch(() => {/* ignore */}); }, 500);
    }, [updateSettings]);

    const handleToggle = async (checked: boolean) => {
        setErrorText(null);
        if (checked) {
            // Enabling. First-time enable must show the data-usage disclosure
            // (Req 8.3) and only show it on first enable (Req 8.4).
            if (!disclosureShown) {
                setDisclosureOpen(true);
                return;
            }
            const ok = await enableAi();
            if (!ok) setErrorText(t("Local storage is unavailable, so Ganyu's AI tips can't be enabled right now."));
        } else {
            try {
                await updateSettings({ aiEnabled: false });
            } catch {
                setErrorText(t("I couldn't save that change just now, please try again."));
            }
        }
    };

    const confirmDisclosure = async () => {
        const ok = await enableAi();
        setDisclosureOpen(false);
        if (!ok) setErrorText(t("Local storage is unavailable, so Ganyu's AI tips can't be enabled right now."));
    };

    const cancelDisclosure = () => {
        setDisclosureOpen(false);
    };

    const commitKey = () => {
        setEditingKey(false);
        if (keyDraft.length > 0) {
            updateSettings({ apiKey: keyDraft }).catch(() => {
                setErrorText(t("I couldn't save the API key just now, please try again."));
            });
        }
        setKeyDraft("");
    };

    // Fields (other than the enable switch) are dimmed/disabled until AI is on.
    const fieldsDisabled = !aiEnabled;

    return (
        <Paper shadow="xs" radius="md" withBorder
            style={{ background: 'var(--mantine-color-body)', overflow: 'hidden' }}
        >
            <UnstyledButton
                onClick={() => setOpened(o => !o)}
                w="100%" p="md"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
                <Group gap="xs">
                    <IconSparkles size={16} style={{ opacity: 0.6 }} />
                    <Text fw={600} size="sm">{t("Ganyu's caring tips (AI)")}</Text>
                </Group>
                <IconChevronDown
                    size={16}
                    style={{
                        transition: 'transform 0.25s ease',
                        transform: opened ? 'rotate(180deg)' : 'rotate(0)',
                        opacity: 0.5,
                    }}
                />
            </UnstyledButton>

            <Collapse in={opened}>
                <Stack gap="sm" px="md" pb="md">
                    <Switch
                        label={t("Ganyu's caring tips (AI)")}
                        description={t("Let Ganyu craft personalized tips from your local focus and todo data")}
                        checked={aiEnabled}
                        onChange={(e) => handleToggle(e.currentTarget.checked)}
                        size="sm"
                    />

                    {errorText && (
                        <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} p="xs">
                            <Text size="xs">{errorText}</Text>
                        </Alert>
                    )}

                    <TextInput
                        label={t("Model endpoint")}
                        placeholder="https://api.example.com/v1/chat/completions"
                        defaultValue={endpoint}
                        onChange={(e) => debouncedUpdate({ endpoint: e.currentTarget.value })}
                        disabled={fieldsDisabled}
                        size="xs" radius="md"
                    />

                    <PasswordInput
                        label={t("API key")}
                        description={t("Stored locally only and shown masked")}
                        placeholder={maskedApiKey() || t("Enter your API key")}
                        value={editingKey ? keyDraft : maskedApiKey()}
                        onFocus={() => { setEditingKey(true); setKeyDraft(""); }}
                        onBlur={commitKey}
                        onChange={(e) => setKeyDraft(e.currentTarget.value)}
                        disabled={fieldsDisabled}
                        size="xs" radius="md"
                    />

                    {(aiEnabled || maskedApiKey()) && (
                        <Alert color="yellow" variant="light" icon={<IconAlertCircle size={16} />} p="xs">
                            <Text size="xs">{t("ganyu.ai.keyStorageWarning")}</Text>
                        </Alert>
                    )}

                    <TextInput
                        label={t("Model (optional)")}
                        placeholder="gpt-4o-mini"
                        defaultValue={model ?? ""}
                        onChange={(e) => debouncedUpdate({ model: e.currentTarget.value })}
                        disabled={fieldsDisabled}
                        size="xs" radius="md"
                    />

                    <Group grow>
                        <NumberInput
                            label={t("Request timeout (ms)")}
                            value={timeoutMs}
                            onChange={(v) => debouncedUpdate({ timeoutMs: Number(v) })}
                            min={1000} max={60000} step={500}
                            disabled={fieldsDisabled}
                            size="xs" radius="md"
                        />
                        <NumberInput
                            label={t("Long-work reminder (min)")}
                            description={t("Ganyu reminds you to rest after focusing this long")}
                            value={Math.round(longWorkThresholdSeconds / 60)}
                            onChange={(v) => debouncedUpdate({ longWorkThresholdSeconds: Number(v) * 60 })}
                            min={5} max={240} step={5}
                            disabled={fieldsDisabled}
                            size="xs" radius="md"
                        />
                    </Group>
                </Stack>
            </Collapse>

            <Modal
                opened={disclosureOpen}
                onClose={cancelDisclosure}
                title={
                    <Group gap="xs">
                        <IconShieldLock size={18} />
                        <Text fw={600} size="sm">{t("What Ganyu will send")}</Text>
                    </Group>
                }
                centered
                radius="md"
            >
                <Stack gap="sm">
                    <Text size="sm">
                        {t("To craft caring tips, the following local data will be sent to the model endpoint you configured:")}
                    </Text>
                    <List size="sm" spacing={4}>
                        <List.Item>{t("Todo text and completion status")}</List.Item>
                        <List.Item>{t("Today's pomodoro count")}</List.Item>
                        <List.Item>{t("Today's focus duration")}</List.Item>
                        <List.Item>{t("Current focus phase")}</List.Item>
                        <List.Item>{t("Completed pomodoro count")}</List.Item>
                        <List.Item>{t("Continuous focus duration")}</List.Item>
                        <List.Item>{t("Current time segment and time")}</List.Item>
                    </List>
                    <Group justify="flex-end" mt="xs">
                        <Button variant="default" size="xs" onClick={cancelDisclosure}>
                            {t("Not now")}
                        </Button>
                        <Button size="xs" onClick={confirmDisclosure}>
                            {t("Enable")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Paper>
    );
}

export default memo(GanyuAiSettings);
