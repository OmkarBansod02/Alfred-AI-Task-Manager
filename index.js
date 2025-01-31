import readlineSync from 'readline-sync';
import { connectToDatabase, getDb } from './db/index.js';
import { todosTable } from './db/schema.js';
import { Alfred } from './mastra/agents/index.js';
import { eq, sql, ilike } from 'drizzle-orm';
import 'dotenv/config';
import chalk from 'chalk';

// Improved JSON extraction function
function extractJsonFromResponse(responseText) {
    // Remove any text before and after JSON objects
    const jsonMatches = responseText.match(/\{[^{}]*"type"[^{}]*\}/g);
    
    if (!jsonMatches) return null;

    // Try parsing each potential JSON match
    for (const jsonStr of jsonMatches) {
        try {
            const parsedJson = JSON.parse(jsonStr);
            // Validate the JSON has the expected structure
            if (parsedJson.type && ['output', 'action'].includes(parsedJson.type)) {
                return jsonStr;
            }
        } catch (error) {
            console.error('JSON parsing error:', error);
        }
    }

    return null;
}

// Tools mapping
const tools = {
    getAllTodos: async () => {
        const db = getDb();
        return await db.select().from(todosTable);
    },
    createTodo: async (todo) => {
        const db = getDb();
        const result = await db.insert(todosTable).values({ 
            todo, 
            createdAt: new Date(),
            updatedAt: new Date() 
        }).returning();
        return result[0];
    },
    deleteTodoById: async (id) => {
        const db = getDb();
        const result = await db.delete(todosTable).where(eq(todosTable.id, parseInt(id))).returning();
        return result.length > 0;
    },
    searchTodo: async (query) => {
        const db = getDb();
        // Split the query into keywords for more flexible matching
        const keywords = query.split(/\s+/);
        
        // Build a complex ILIKE condition that matches all keywords
        const conditions = keywords.map(keyword => 
            ilike(todosTable.todo, `%${keyword}%`)
        );
        
        // Combine conditions with AND to ensure all keywords are present
        const combinedCondition = conditions.reduce((acc, condition) => 
            sql`${acc} AND ${condition}`
        );
        
        return await db.select().from(todosTable)
            .where(combinedCondition);
    }
};

function parseTodo(todoItem) {
    // If todo is a JSON string, parse it
    if (typeof todoItem.todo === 'string') {
        try {
            const parsedTodo = JSON.parse(todoItem.todo);
            return parsedTodo.description || todoItem.todo;
        } catch {
            return todoItem.todo;
        }
    }
    // If todo is already an object
    return todoItem.todo.description || todoItem.todo;
}

function formatTodoResponse(result, action) {
    if (!result) return ' Action failed';

    switch (action.function) {
        case 'createTodo': {
            const responseText = action.output || ` Added new todo: "${result.todo}"`;
            return responseText;
        }
        case 'getAllTodos': {
            if (!Array.isArray(result) || result.length === 0) {
                return ' 🏖️ No todos found! Time to relax or dream up your next adventure! 🌴';
            }
            
            // Alfred's witty tagline
            const tagline = "🚀 Time to turn those todos into 'ta-das'! 💥";
            
            // Emoji mapping for different types of tasks
            const getTaskEmoji = (todoText) => {
                const lowercaseText = todoText.toLowerCase();
                if (lowercaseText.includes('job') || lowercaseText.includes('apply')) return '💼';
                if (lowercaseText.includes('video') || lowercaseText.includes('record')) return '🎥';
                if (lowercaseText.includes('debug') || lowercaseText.includes('code')) return '💻';
                if (lowercaseText.includes('meeting')) return '📅';
                if (lowercaseText.includes('save') || lowercaseText.includes('gotham')) return '🦸';
                return '📝';
            };

            const todoList = result.map((todo, index) => {
                const todoText = parseTodo(todo);
                const emoji = getTaskEmoji(todoText);
                return `  ${emoji} ${index + 1}. ${todoText}`;
            }).join('\n');

            return `${tagline}\n\n Your Epic Todo List:\n${todoList}`;
        }
        case 'searchTodo': {
            if (!Array.isArray(result) || result.length === 0) {
                return ' 🔍 No matching todos found';
            }
            // If multiple matches, return all matching todo IDs
            if (result.length > 1) {
                return result.map(todo => ({
                    id: todo.id, 
                    todo: todo.todo, 
                    createdAt: todo.createdAt
                }));
            }
            // If single match, return its ID
            return result[0].id;
        }
        case 'deleteTodoById':
            return result === true ? ' ✅ Task marked as completed!' : ' ❌ Failed to update task';
        default:
            return ' ❓ Unknown action';
    }
}

async function main() {
    try {
        // Connect to database first
        const db = await connectToDatabase();
        if (!db) {
            console.error(chalk.red('Failed to connect to database. Please check if PostgreSQL is running.'));
            process.exit(1);
        }
        
        console.log(chalk.green(' 🤖 Alfred AI Assistant Activated! '));
        console.log(chalk.yellow(' Your intelligent task management companion is ready! 🧠'));
        console.log(chalk.yellow(' Type your commands or "exit" to quit'));
        
        while (true) {
            const input = readlineSync.question(chalk.blue('>>'));
            if (input.toLowerCase() === 'exit') {
                console.log(chalk.gray(' Goodbye!'));
                break;
            }

            try {
                const response = await Alfred.generate([
                    { role: 'user', content: input }
                ]);

                if (response && response.steps && response.steps[0]) {
                    const responseText = response.steps[0].text;
                    const jsonText = extractJsonFromResponse(responseText);
                    
                    if (jsonText) {
                        try {
                            const action = JSON.parse(jsonText);
                            
                            if (action.type === 'output') {
                                console.log(chalk.green(' :'), action.output);
                            } else if (action.type === 'action') {
                                const fn = tools[action.function];
                                if (!fn) throw new Error(`Invalid function: ${action.function}`);
                                
                                const result = await fn(action.input);
                                const formattedResponse = formatTodoResponse(result, action);
                                
                                // If it's a search result and we found a match, automatically delete it
                                if (action.function === 'searchTodo' && typeof formattedResponse === 'number') {
                                    const deleteResult = await tools.deleteTodoById(formattedResponse);
                                    console.log(chalk.green(' :'), deleteResult ? chalk.green(' Task marked as completed!') : chalk.red(' Failed to update task'));
                                } else if (action.function === 'searchTodo' && Array.isArray(formattedResponse)) {
                                    const deleteResults = await Promise.all(formattedResponse.map(todo => tools.deleteTodoById(todo.id)));
                                    console.log(chalk.green(' :'), deleteResults.every(result => result) ? chalk.green(' Tasks marked as completed!') : chalk.red(' Failed to update tasks'));
                                } else {
                                    console.log(chalk.green(' :'), formattedResponse);
                                }
                            }
                        } catch (actionError) {
                            console.error(chalk.red(" : Error processing action:"), actionError);
                            console.log(chalk.yellow(" : I encountered an issue. Please try again."));
                        }
                    } else {
                        console.log(chalk.yellow(' : Could not parse response'));
                    }
                } else {
                    console.log(chalk.yellow(" : I had trouble processing your request. Please try again."));
                }
            } catch (error) {
                console.error(chalk.red(' : Error:'), error.message);
                console.log(chalk.yellow(" : There was a problem. Please try again later."));
            }
        }
    } catch (error) {
        console.error(chalk.red('Error:'), error);
    }
}

main().catch(console.error);