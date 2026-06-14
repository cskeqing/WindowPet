import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
    Stack, Group, Text, Paper, Button, ActionIcon, TextInput,
    Checkbox, Progress, Tooltip, Transition, Modal,
} from "@mantine/core";
import { IconPlus, IconX, IconStar, IconStarFilled, IconTrash, IconAlertCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useTodoStore } from "../../../hooks/useTodoStore";
import { TodoItem } from "../../../types/IOffice";

function TodoList() {
    const { t } = useTranslation();
    const { todos, addTodo, toggleTodo, removeTodo, setCurrent, clearCompleted } = useTodoStore();
    const [newTodoText, setNewTodoText] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [newItemId, setNewItemId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleAddTodo = useCallback(() => {
        if (newTodoText.trim()) {
            const text = newTodoText.trim();
            setNewTodoText('');
            addTodo(text);
            // Track new item for animation
            const newId = useTodoStore.getState().todos[useTodoStore.getState().todos.length - 1]?.id;
            if (newId) {
                setNewItemId(newId);
                setTimeout(() => setNewItemId(null), 400);
            }
            inputRef.current?.focus();
        }
    }, [newTodoText, addTodo]);

    const handleDelete = useCallback((id: string) => {
        setDeleteConfirmId(id);
    }, []);

    const confirmDelete = useCallback(() => {
        if (deleteConfirmId) {
            removeTodo(deleteConfirmId);
            setDeleteConfirmId(null);
        }
    }, [deleteConfirmId, removeTodo]);

    // Sort: uncompleted first (preserve order), completed sink to bottom
    const sortedTodos = useMemo(() => {
        const uncompleted = todos.filter(t => !t.completed);
        const completed = todos.filter(t => t.completed);
        return [...uncompleted, ...completed];
    }, [todos]);

    const completedCount = todos.filter(t => t.completed).length;
    const deleteTarget = todos.find(t => t.id === deleteConfirmId);

    return (
        <>
            <Paper shadow="xs" radius="md" p="md" withBorder
                style={{ background: 'var(--mantine-color-body)' }}
            >
                <Stack gap="sm">
                    <Group justify="space-between">
                        <Group gap="xs">
                            <Text fw={600} size="sm">{t("Tasks")}</Text>
                            {todos.length > 0 && (
                                <Text size="xs" c="dimmed" fw={500}>
                                    {completedCount}/{todos.length}
                                </Text>
                            )}
                        </Group>
                        {completedCount > 0 && (
                            <Button
                                variant="subtle" size="compact-xs" color="gray"
                                leftSection={<IconTrash size={12} />}
                                onClick={clearCompleted}
                                style={{ opacity: 0.7, transition: 'opacity 0.2s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                            >
                                {t("Clear completed")}
                            </Button>
                        )}
                    </Group>

                    {todos.length > 0 && (
                        <Progress
                            value={(completedCount / todos.length) * 100}
                            size={4} radius="xl" color="teal"
                            style={{ transition: 'all 0.4s ease' }}
                        />
                    )}

                    {/* Add input */}
                    <Group gap="xs">
                        <TextInput
                            ref={inputRef}
                            placeholder={t("Add a task...")}
                            value={newTodoText}
                            onChange={(e) => setNewTodoText(e.currentTarget.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                            style={{ flex: 1 }}
                            size="sm"
                            radius="md"
                            styles={{ input: { transition: 'border-color 0.2s', '&:focus': { borderColor: 'var(--mantine-color-teal-5)' } } }}
                        />
                        <ActionIcon
                            variant="filled" color="teal" radius="md"
                            onClick={handleAddTodo} disabled={!newTodoText.trim()}
                            style={{ transition: 'transform 0.15s', transform: newTodoText.trim() ? 'scale(1)' : 'scale(0.9)' }}
                        >
                            <IconPlus size={16} />
                        </ActionIcon>
                    </Group>

                    {/* Empty state */}
                    {todos.length === 0 && (
                        <Stack align="center" py="xl" gap="xs">
                            <Text size="2rem">📋</Text>
                            <Text size="sm" c="dimmed" ta="center">
                                {t("Add your first task and start focusing with your pet!")}
                            </Text>
                        </Stack>
                    )}

                    {/* Todo items */}
                    <Stack gap={4}>
                        {sortedTodos.map((todo) => (
                            <TodoRow
                                key={todo.id}
                                todo={todo}
                                isNew={todo.id === newItemId}
                                onToggle={toggleTodo}
                                onSetCurrent={setCurrent}
                                onDelete={handleDelete}
                                t={t}
                            />
                        ))}
                    </Stack>
                </Stack>
            </Paper>

            {/* Delete confirmation modal */}
            <Modal
                opened={!!deleteConfirmId}
                onClose={() => setDeleteConfirmId(null)}
                title={<Group gap="xs"><IconAlertCircle size={18} color="var(--mantine-color-red-5)" /><Text fw={600} size="sm">{t("Delete task?")}</Text></Group>}
                size="xs" centered radius="md"
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {deleteTarget?.text}
                    </Text>
                    <Group justify="flex-end" gap="xs">
                        <Button variant="subtle" color="gray" size="xs" onClick={() => setDeleteConfirmId(null)}>
                            {t("Cancel")}
                        </Button>
                        <Button color="red" size="xs" onClick={confirmDelete}>
                            {t("Delete")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}

// Individual todo row with animation support
interface TodoRowProps {
    todo: TodoItem;
    isNew: boolean;
    onToggle: (id: string) => void;
    onSetCurrent: (id: string) => void;
    onDelete: (id: string) => void;
    t: (key: string) => string;
}

const TodoRow = memo(function TodoRow({ todo, isNew, onToggle, onSetCurrent, onDelete, t }: TodoRowProps) {
    return (
        <Transition mounted={true} transition="slide-down" duration={isNew ? 300 : 0}>
            {(styles) => (
                <Group
                    gap="xs" wrap="nowrap" py={4} px="xs"
                    style={{
                        ...styles,
                        borderRadius: 'var(--mantine-radius-sm)',
                        transition: 'background 0.2s, opacity 0.4s, transform 0.3s',
                        opacity: todo.completed ? 0.6 : 1,
                        background: todo.isCurrent && !todo.completed ? 'var(--mantine-color-yellow-light)' : 'transparent',
                        transform: todo.completed ? 'scale(0.98)' : 'scale(1)',
                        cursor: 'default',
                    }}
                    onMouseEnter={(e) => {
                        if (!todo.completed) e.currentTarget.style.background = 'var(--mantine-color-dark-6)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = todo.isCurrent && !todo.completed ? 'var(--mantine-color-yellow-light)' : 'transparent';
                    }}
                >
                    <Checkbox
                        checked={todo.completed}
                        onChange={() => onToggle(todo.id)}
                        size="sm" radius="xl"
                        styles={{
                            input: { transition: 'background 0.2s, border-color 0.2s' },
                        }}
                    />
                    <Text
                        size="sm"
                        td={todo.completed ? 'line-through' : undefined}
                        c={todo.completed ? 'dimmed' : undefined}
                        style={{
                            flex: 1,
                            transition: 'color 0.3s, text-decoration 0.3s',
                        }}
                    >
                        {todo.text}
                    </Text>
                    {!todo.completed && (
                        <Tooltip label={todo.isCurrent ? t("Current task") : t("Set as current")} withArrow>
                            <ActionIcon
                                variant="subtle" size="sm"
                                color={todo.isCurrent ? 'yellow' : 'gray'}
                                onClick={() => onSetCurrent(todo.id)}
                                style={{ transition: 'color 0.2s, transform 0.15s' }}
                            >
                                {todo.isCurrent ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                            </ActionIcon>
                        </Tooltip>
                    )}
                    <Tooltip label={t("Delete")} withArrow>
                        <ActionIcon
                            variant="subtle" size="sm" color="red"
                            onClick={() => onDelete(todo.id)}
                            style={{ opacity: 0.5, transition: 'opacity 0.2s, transform 0.15s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                            <IconX size={14} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            )}
        </Transition>
    );
});

export default memo(TodoList);
