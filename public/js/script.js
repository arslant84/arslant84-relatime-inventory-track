console.log("JavaScript file loaded!");

class InventoryItem {
    constructor(id, name, quantity) {
        this.id = id;
        this.name = name;
        this.quantity = quantity;
    }

    render() {
        const listItem = document.createElement('li');
        listItem.id = `item-${this.id}`;
        listItem.innerHTML = `
            ${this.name}:
            <button onclick="inventoryManager.changeQuantity(${this.id}, -1)">-</button>
            <input type="number" id="quantity-${this.id}" value="${this.quantity}" min="0" style="width: 60px;">
            <button onclick="inventoryManager.changeQuantity(${this.id}, 1)">+</button>
            <button onclick="inventoryManager.updateQuantity(${this.id}, document.getElementById('quantity-${this.id}').value)">Update</button>
            <button onclick="inventoryManager.removeItem(${this.id})">Remove</button>
        `;
        return listItem;
    }
}

class InventoryManager {
    constructor() {
        this.socket = io();
        this.inventoryListElement = document.getElementById('inventory-list');
        this.itemNameInput = document.getElementById('itemName');
        this.itemQuantityInput = document.getElementById('itemQuantity');
        this.statusMessageElement = document.getElementById('status-message');
        this.sortBySelect = document.getElementById('sortBy');
        this.sortOrderSelect = document.getElementById('sortOrder');
        this.searchInput = document.getElementById('search');
        this.currentInventory = [];
        this.LOCAL_STORAGE_KEY = 'inventory-data';

        // Socket event handlers
        this.socket.on('inventoryUpdate', this.handleInventoryUpdate.bind(this));
        this.socket.on('connect', () => console.log('Connected to server'));
        this.socket.on('addItemError', this.handleAddItemError.bind(this));
        this.socket.on('itemAdded', this.handleItemAdded.bind(this));
        this.socket.on('updateQuantityError', this.handleUpdateQuantityError.bind(this));
        
        // Debug event listeners
        this.socket.onAny((event, ...args) => {
            console.log(`[Socket Event] ${event}:`, args);
        });

        this.loadInventoryFromStorage();
        this.setupEventListeners();
    }

    loadInventoryFromStorage() {
        const storedInventory = localStorage.getItem(this.LOCAL_STORAGE_KEY);
        if (storedInventory) {
            this.currentInventory = JSON.parse(storedInventory).map(itemData => new InventoryItem(itemData.id, itemData.name, itemData.quantity));
            this.renderInventory(this.currentInventory);
            this.displayStatus('Inventory loaded from local storage.', 'gray');
        }
    }

    handleInventoryUpdate(updatedInventory) {
        console.log('Inventory updated:', updatedInventory);
        this.currentInventory = updatedInventory.map(itemData => new InventoryItem(itemData.id, itemData.name, itemData.quantity));
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(this.currentInventory));
        this.filterAndSortInventory();
    }

    handleAddItemError(errorMessage) {
        alert(`Error adding item: ${errorMessage}`);
        this.displayStatus(errorMessage, 'red');
    }

    handleUpdateQuantityError(errorMessage) {
        alert(`Error updating quantity: ${errorMessage}`);
        this.displayStatus(errorMessage, 'red');
    }

    handleItemAdded(data) {
        console.log('Item added successfully:', data);
        this.displayStatus(`${data.name} added successfully!`);
        this.itemNameInput.value = '';
        this.itemQuantityInput.value = '1';
        // Force a refresh of the inventory
        this.socket.emit('requestInventoryUpdate');
    }

    displayStatus(message, color = 'green') {
        this.statusMessageElement.textContent = message;
        this.statusMessageElement.style.color = color;
        setTimeout(() => {
            this.statusMessageElement.textContent = '';
            this.statusMessageElement.style.color = 'green';
        }, 3000);
    }

    sortInventory() {
        this.filterAndSortInventory();
    }

    filterInventory() {
        this.filterAndSortInventory();
    }

    filterAndSortInventory() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        const sortBy = this.sortBySelect.value;
        const sortOrder = this.sortOrderSelect.value;

        const filteredInventory = this.currentInventory.filter(item =>
            item.name.toLowerCase().includes(searchTerm)
        );

        filteredInventory.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'quantity') {
                comparison = a.quantity - b.quantity;
            }
            return sortOrder === 'desc' ? comparison * -1 : comparison;
        });

        this.renderInventory(filteredInventory);
    }

    renderInventory(inventoryData) {
        this.inventoryListElement.innerHTML = '';
        if (inventoryData && inventoryData.length > 0) {
            inventoryData.forEach(item => {
                this.inventoryListElement.appendChild(item.render());
            });
        } else {
            const listItem = document.createElement('li');
            listItem.textContent = 'No items in inventory.';
            this.inventoryListElement.appendChild(listItem);
        }
    }

    changeQuantity(itemId, change) {
        const item = this.currentInventory.find(item => item.id === itemId);
        if (item) {
            const quantityInput = document.getElementById(`quantity-${itemId}`);
            if (quantityInput) {
                let newQuantity = parseInt(quantityInput.value) + change;
                if (newQuantity >= 0) {
                    quantityInput.value = newQuantity;
                    this.updateQuantity(itemId, newQuantity);
                }
            }
        }
    }

    addItem() {
        const name = this.itemNameInput.value.trim();
        const quantity = parseInt(this.itemQuantityInput.value);

        if (!name) {
            this.displayStatus('Please enter an item name.', 'red');
            return;
        }

        if (isNaN(quantity) || quantity < 0) {
            this.displayStatus('Please enter a valid quantity (non-negative number).', 'red');
            return;
        }

        console.log('Sending addItem event with data:', { name, quantity });
        this.displayStatus('Adding item...', 'blue');
        this.socket.emit('addItem', { name, quantity });
    }

    removeItem(itemId) {
        console.log('Requesting removal for item with ID:', itemId);
        this.socket.emit('removeItem', itemId);
        this.displayStatus('Item removing...');
    }

    updateQuantity(itemId, newQuantity) {
        const quantity = parseInt(newQuantity);
        if (isNaN(quantity) || quantity < 0) {
            alert('Please enter a valid quantity (non-negative number).');
            return;
        }
        this.socket.emit('updateQuantity', { id: itemId, quantity: quantity });
        this.displayStatus('Quantity updating...');
    }

    setupEventListeners() {
        const form = document.getElementById('itemForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addItem();
        });
        
        this.sortBySelect.addEventListener('change', () => this.sortInventory());
        this.sortOrderSelect.addEventListener('change', () => this.sortInventory());
        this.searchInput.addEventListener('input', () => this.filterInventory());
    }
}

// Service Worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('Service Worker registered:', registration))
            .catch(error => console.log('Service Worker registration failed:', error));
    });
}

const inventoryManager = new InventoryManager();