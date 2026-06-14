import { memo, useEffect } from "react";
import { Stack } from "@mantine/core";
import { useFocusStore } from "../../hooks/useFocusStore";
import { useTodoStore } from "../../hooks/useTodoStore";
import FocusTimer from "./office/FocusTimer";
import TodoList from "./office/TodoList";
import FocusSettings from "./office/FocusSettings";
import GanyuAiSettings from "./office/GanyuAiSettings";

function Office() {
    const loadConfig = useFocusStore(s => s.loadConfig);
    const loadTodos = useTodoStore(s => s.loadTodos);

    useEffect(() => { loadConfig(); loadTodos(); }, []);

    return (
        <Stack gap="lg">
            <FocusTimer />
            <TodoList />
            <FocusSettings />
            <GanyuAiSettings />
        </Stack>
    );
}

export default memo(Office);
