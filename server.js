const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 3000;
const inventoryFilePath = path.join(__dirname, 'inventory.json');

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use('/manifest.json', express.static('public/manifest.json'));
app.use('/favicon.ico', express.static('public/favicon.ico')); 

let inventory = [];
let nextItemId = 1;

async function readInventory() {
    try {
        const data = await fs.readFile(inventoryFilePath, 'utf8');
        inventory = JSON.parse(data);
        if (inventory.length > 0) {
            nextItemId = Math.max(...inventory.map(item => item.id)) + 1;
        } else {
            nextItemId = 1;
        }
        console.log('Inventory loaded from file:', inventory);
    } catch (error) {
        console.error('Error reading inventory file:', error);
        inventory = [];
        nextItemId = 1;
    }
}

async function writeInventory() {
    try {
        const data = JSON.stringify(inventory, null, 2);
        await fs.writeFile(inventoryFilePath, data, 'utf8');
        console.log('Inventory saved to file:', inventory);
    } catch (error) {
        console.error('Error writing inventory file:', error);
    }
}

readInventory();

app.get('/', (req, res) => {
    res.render('index', { inventoryItems: inventory });
});

const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit('inventoryUpdate', inventory);

    const updateInventoryAndNotify = async () => {
        await writeInventory();
        io.emit('inventoryUpdate', inventory);
    };

    socket.on('requestInventoryUpdate', () => {
        console.log('Client requested inventory update');
        socket.emit('inventoryUpdate', inventory);
    });

    socket.on('addItem', async (newItem) => {
        console.log('Received new item:', newItem);
        if (!newItem?.name?.trim()) {
            console.log('Error: Item name is required');
            socket.emit('addItemError', 'Item name is required.');
            return;
        }
    
        const quantity = parseInt(newItem.quantity);
        if (isNaN(quantity) || quantity < 0) {
            console.log('Error: Valid quantity is required');
            socket.emit('addItemError', 'Valid quantity is required.');
            return;
        }
    
        const item = {
            id: nextItemId++,
            name: newItem.name.trim(),
            quantity: quantity
        };
    
        console.log('Adding item to inventory:', item);
        inventory.push(item);
        await updateInventoryAndNotify();
        console.log('Emitting itemAdded event to client');
        socket.emit('itemAdded', { id: item.id, name: item.name }); 
    });

    socket.on('removeItem', async (itemId) => {
        inventory = inventory.filter(item => item.id !== parseInt(itemId));
        await updateInventoryAndNotify();
    });

    socket.on('updateQuantity', async ({ id, quantity }) => {
        const parsedQuantity = parseInt(quantity);
        if (!isNaN(parsedQuantity) && parsedQuantity >= 0) {
            const itemToUpdate = inventory.find(item => item.id === parseInt(id));
            if (itemToUpdate) {
                itemToUpdate.quantity = parsedQuantity;
                await updateInventoryAndNotify();
            }
        } else {
            socket.emit('updateQuantityError', 'Invalid quantity. Please enter a non-negative number.');
        }
    });

    socket.on('disconnect', () => console.log('A user disconnected'));
});

const startServer = (initialPort) => {
    const tryPort = (port) => {
        server.listen(port)
            .on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.log(`Port ${port} is busy, trying ${port + 1}...`);
                    tryPort(port + 1);
                } else {
                    console.error('Server error:', error);
                }
            })
            .on('listening', () => {
                console.log(`Server running on http://localhost:${port}`);
            });
    };

    tryPort(initialPort);
};

startServer(port);