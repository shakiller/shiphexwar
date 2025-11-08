class HexagonalBattleship {
    constructor() {
        this.myBoardCanvas = document.getElementById('myBoard');
        this.opponentBoardCanvas = document.getElementById('opponentBoard');
        this.myCtx = this.myBoardCanvas.getContext('2d');
        this.opponentCtx = this.opponentBoardCanvas.getContext('2d');
        
        this.handleResize = this.handleResize.bind(this);
        this.updateCanvasSizes();
        window.addEventListener('resize', this.handleResize);
        if (window.ResizeObserver) {
            this.canvasResizeObserver = new ResizeObserver(this.handleResize);
            this.canvasResizeObserver.observe(this.myBoardCanvas.parentElement);
            this.canvasResizeObserver.observe(this.opponentBoardCanvas.parentElement);
        }
        this.syncStatusTimeout = null;
        this.updateSyncControls({ visible: false, enabled: false });
        this.updateSyncStatus();
        
        // Переменные для отслеживания мыши
        this.currentMouseX = 0;
        this.currentMouseY = 0;
        this.lastHoveredHex = null;
        
        // Переменные для подсветки последнего клика
        this.lastClickedHexMyBoard = null;
        this.lastClickedHexOpponentBoard = null;
        
        // Отображение зон клика
        this.showTouchZones = false;
        
        // Отображение запрещенных клеток
        this.showForbiddenCells = false;
        
        // Настройки игры
        this.boardSize = 8;
        this.ships = [
            { size: 4, count: 1, name: "Линкор" },
            { size: 3, count: 2, name: "Крейсер" },
            { size: 2, count: 3, name: "Эсминец" },
            { size: 1, count: 4, name: "Катер" }
        ];
        
        // Игровое состояние
        this.myBoard = [];
        this.opponentBoard = [];
        this.myShips = [];
        this.opponentShips = [];
        this.myShots = [];
        this.opponentShots = [];
        this.currentPlayer = 'me';
        this.gamePhase = 'setup';
        this.selectedShip = null;
        this.shipOrientation = 0;
        
        // ПРАВИЛЬНЫЕ направления для гексагональной сетки
        this.directionNames = ['↓', '↘', '↙', '↑', '↖', '↗'];
        
        // Онлайн-переменные
        this.peer = null;
        this.connection = null;
        this.isOnline = false;
        this.isHost = false;
        this.roomId = null;
        
        // Переменные для тестового режима
        this.testMode = false;
        this.testLines = [];
        
        // ПЕРЕМЕННЫЕ ДЛЯ УМНОГО БОТА
        this.botDifficulty = 'smart';
        this.botLastHit = null;
        this.botTargetMode = false;
        this.botPotentialTargets = [];
        this.botCurrentDirection = null;
        this.botHitSequence = [];
        this.botForbiddenCells = new Set(); // Клетки вокруг потопленных кораблей (для бота)
        this.botSunkShips = []; // Потопленные корабли
        this.botHuntMode = true; // Режим охоты (поиск новых кораблей)
        
        // ЗАПРЕЩЕННЫЕ КЛЕТКИ ДЛЯ ИГРОКА
        this.playerForbiddenCells = new Set(); // Клетки вокруг потопленных кораблей противника
        
        this.initializeGame();
        this.setupEventListeners();
        this.createShipPalette();
        this.drawBoards();
    }
    
    // Устанавливаем размеры canvas с учетом devicePixelRatio
    setCanvasSize(canvas, width, height) {
        const dpr = window.devicePixelRatio || 1;
        const targetWidth = Math.max(1, Math.round(width));
        const targetHeight = Math.max(1, Math.round(height));
        canvas.style.width = targetWidth + 'px';
        canvas.style.height = targetHeight + 'px';
        canvas.width = targetWidth * dpr;
        canvas.height = targetHeight * dpr;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
    }

    updateCanvasSizes() {
        this.resizeCanvasToParent(this.myBoardCanvas);
        this.resizeCanvasToParent(this.opponentBoardCanvas);
    }

    resizeCanvasToParent(canvas) {
        const parent = canvas.parentElement;
        if (!parent) {
            return;
        }
        const rect = parent.getBoundingClientRect();
        const width = rect.width || canvas.clientWidth || 1;
        const height = rect.height || width;
        this.setCanvasSize(canvas, width, height);
    }

    handleResize() {
        this.updateCanvasSizes();
        this.drawBoards();
    }

    getMyRole() {
        return this.isHost ? 'host' : 'client';
    }

    getOpponentRole() {
        return this.isHost ? 'client' : 'host';
    }

    mapRoleToPerspective(role) {
        return role === this.getMyRole() ? 'me' : 'opponent';
    }

    getActivePlayerRole() {
        return this.currentPlayer === 'me' ? this.getMyRole() : this.getOpponentRole();
    }

    updateSyncControls({ visible = false, enabled = false } = {}) {
        const controls = document.getElementById('syncControls');
        const button = document.getElementById('syncButton');
        if (!controls || !button) {
            return;
        }
        controls.style.display = visible ? 'block' : 'none';
        button.disabled = !enabled;
        button.classList.toggle('disabled', !enabled);
    }

    updateSyncStatus(message = '', type = 'info', options = {}) {
        const statusElement = document.getElementById('syncStatus');
        if (!statusElement) {
            return;
        }

        const { autoHide = true, duration = 4000 } = options;

        if (this.syncStatusTimeout) {
            clearTimeout(this.syncStatusTimeout);
            this.syncStatusTimeout = null;
        }

        statusElement.classList.remove('success', 'error', 'info');

        if (!message) {
            statusElement.style.display = 'none';
            statusElement.textContent = '';
            return;
        }

        statusElement.textContent = message;
        statusElement.style.display = 'block';
        statusElement.classList.add(type || 'info');

        if (autoHide) {
            this.syncStatusTimeout = setTimeout(() => this.updateSyncStatus(), duration);
        }
    }

    buildGameStatePayload(reason = 'sync') {
        return {
            type: 'game_state',
            ships: this.myShips,
            gamePhase: this.gamePhase,
            activeRole: this.getActivePlayerRole(),
            timestamp: Date.now(),
            reason
        };
    }

    syncOnlineState() {
        if (!this.isOnline) {
            this.updateSyncStatus('Синхронизация доступна только в онлайн режиме.', 'error', { autoHide: false });
            return;
        }

        if (!this.connection || !this.connection.open) {
            this.updateSyncStatus('Нет активного соединения для синхронизации.', 'error', { autoHide: false });
            this.updateSyncControls({ visible: true, enabled: false });
            return;
        }

        const sentState = this.sendData(this.buildGameStatePayload('sync_push'));
        const sentRequest = this.sendData({ type: 'request_state', reason: 'sync_request', timestamp: Date.now() });

        if (sentState && sentRequest) {
            this.updateSyncStatus('Запрос синхронизации отправлен.', 'info');
        }
    }

    notifyReadyState() {
        if (!this.isOnline || !this.connection || !this.connection.open) {
            return;
        }

        if (!this.allShipsPlaced()) {
            return;
        }

        if (this.sendData({ type: 'ready', ships: this.myShips, timestamp: Date.now() })) {
            this.updateSyncStatus('Отправлена ваша расстановка кораблей.', 'info');
        }
    }
    
    // Преобразуем координаты мыши в координаты canvas
    getMousePos(canvas, evt) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return {
            x: (evt.clientX - rect.left) * (canvas.width / rect.width / dpr),
            y: (evt.clientY - rect.top) * (canvas.height / rect.height / dpr)
        };
    }
    
    initializeGame() {
        this.myBoard = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(''));
        this.opponentBoard = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(''));
        
        this.myShips = [];
        this.opponentShips = [];
        this.myShots = [];
        this.opponentShots = [];
        this.currentPlayer = 'me';
        this.gamePhase = 'setup';
        this.selectedShip = null;
        this.shipOrientation = 0;
        this.lastHoveredHex = null;
        this.lastClickedHexMyBoard = null;
        this.lastClickedHexOpponentBoard = null;
        
        // Сброс состояния умного бота
        this.botLastHit = null;
        this.botTargetMode = false;
        this.botPotentialTargets = [];
        this.botCurrentDirection = null;
        this.botHitSequence = [];
        this.botForbiddenCells.clear();
        this.botSunkShips = [];
        this.botHuntMode = true;
        
        // Сброс запрещенных клеток игрока
        this.playerForbiddenCells.clear();
        
        this.updateGamePhase();
        this.updateScores();
        this.updateRotationInfo();
        this.updateLastClickInfo();
        this.drawBoards();
        this.createShipPalette();
        
        document.getElementById('startGame').style.display = this.isOnline ? 'none' : 'block';
    }
    
    setupEventListeners() {
        // Обработчики кликов с правильным преобразованием координат
        this.myBoardCanvas.addEventListener('click', (e) => {
            const pos = this.getMousePos(this.myBoardCanvas, e);
            this.handleMyBoardClick(pos.x, pos.y);
        });
        
        this.opponentBoardCanvas.addEventListener('click', (e) => {
            const pos = this.getMousePos(this.opponentBoardCanvas, e);
            this.handleOpponentBoardClick(pos.x, pos.y);
        });
        
        // Обработчики движения мыши для предпросмотра
        this.myBoardCanvas.addEventListener('mousemove', (e) => {
            const pos = this.getMousePos(this.myBoardCanvas, e);
            this.currentMouseX = pos.x;
            this.currentMouseY = pos.y;
            
            // Обновляем координаты на дисплее
            document.getElementById('myBoardCoords').textContent = 
                `x: ${Math.floor(pos.x)}, y: ${Math.floor(pos.y)}`;
            
            this.handleMouseMove(pos.x, pos.y, this.myBoardCanvas);
        });
        
        this.opponentBoardCanvas.addEventListener('mousemove', (e) => {
            const pos = this.getMousePos(this.opponentBoardCanvas, e);
            
            // Обновляем координаты на дисплее
            document.getElementById('opponentBoardCoords').textContent = 
                `x: ${Math.floor(pos.x)}, y: ${Math.floor(pos.y)}`;
        });
        
        // Убираем предпросмотр при уходе мыши с поля
        this.myBoardCanvas.addEventListener('mouseleave', () => {
            this.lastHoveredHex = null;
            this.drawBoards();
        });

        // Остальные обработчики
        document.getElementById('modeLocal').addEventListener('click', () => this.setGameMode('local'));
        document.getElementById('modeOnline').addEventListener('click', () => this.setGameMode('online'));
        document.getElementById('randomShips').addEventListener('click', () => this.randomizeShips());
        document.getElementById('startGame').addEventListener('click', () => this.startBattle());
        document.getElementById('newGameBtn').addEventListener('click', () => this.initializeGame());
        document.getElementById('rotateLeft').addEventListener('click', () => this.rotateLeft());
        document.getElementById('rotateRight').addEventListener('click', () => this.rotateRight());
        document.getElementById('toggleTouchZones').addEventListener('click', () => this.toggleTouchZones());
        
        // Добавляем обработчик для тестового режима
        document.getElementById('toggleTestMode').addEventListener('click', () => this.toggleTestMode());
        
        // Добавляем обработчик для показа запрещенных клеток
        document.getElementById('toggleForbiddenCells').addEventListener('click', () => this.toggleForbiddenCells());

        const syncButton = document.getElementById('syncButton');
        if (syncButton) {
            syncButton.addEventListener('click', () => this.syncOnlineState());
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' || e.key === 'к' || e.key === 'R' || e.key === 'Й') {
                this.rotateRight();
            }
            if (e.key === 'q' || e.key === 'й' || e.key === 'Q' || e.key === 'Й') {
                this.rotateLeft();
            }
        });
    }
    
    toggleTestMode() {
        this.testMode = !this.testMode;
        const testInfo = document.getElementById('testInfo');
        const toggleBtn = document.getElementById('toggleTestMode');
        
        if (this.testMode) {
            testInfo.style.display = 'block';
            toggleBtn.textContent = 'Выключить тестовый режим направлений';
            toggleBtn.style.background = '#F44336';
        } else {
            testInfo.style.display = 'none';
            toggleBtn.textContent = 'Включить тестовый режим направлений';
            toggleBtn.style.background = '#FF9800';
            this.testLines = [];
            this.drawBoards();
        }
    }
    
    toggleTouchZones() {
        this.showTouchZones = !this.showTouchZones;
        document.getElementById('toggleTouchZones').textContent = 
            this.showTouchZones ? 'Скрыть зоны клика' : 'Показать зоны клика';
        this.drawBoards();
    }
    
    // НОВЫЙ МЕТОД ДЛЯ ПЕРЕКЛЮЧЕНИЯ ОТОБРАЖЕНИЯ ЗАПРЕЩЕННЫХ КЛЕТОК
    toggleForbiddenCells() {
        this.showForbiddenCells = !this.showForbiddenCells;
        document.getElementById('toggleForbiddenCells').textContent = 
            this.showForbiddenCells ? 'Скрыть запрещенные клетки' : 'Показать запрещенные клетки';
        this.drawBoards();
    }
    
    handleMouseMove(x, y, canvas) {
        if (this.gamePhase !== 'setup' || !this.selectedShip) return;
        
        const hex = this.getHexAtPosition(x, y, canvas);
        if (hex && (this.lastHoveredHex === null || hex.row !== this.lastHoveredHex.row || hex.col !== this.lastHoveredHex.col)) {
            this.lastHoveredHex = hex;
            this.drawBoards();
        }
    }
    
    rotateLeft() {
        this.shipOrientation = (this.shipOrientation + 5) % 6;
        this.updateRotationInfo();
        this.drawBoards();
    }
    
    rotateRight() {
        this.shipOrientation = (this.shipOrientation + 1) % 6;
        this.updateRotationInfo();
        this.drawBoards();
    }
    
    updateRotationInfo() {
        const rotationInfo = document.getElementById('rotationInfo');
        rotationInfo.textContent = `Направление: ${this.directionNames[this.shipOrientation]}`;
    }
    
    updateLastClickInfo() {
        const lastClickInfo = document.getElementById('lastClickInfo');
        const lastClickCoords = document.getElementById('lastClickCoords');
        
        let infoText = '';
        
        if (this.lastClickedHexMyBoard) {
            infoText += `Ваше поле: [${this.lastClickedHexMyBoard.row},${this.lastClickedHexMyBoard.col}] `;
        }
        
        if (this.lastClickedHexOpponentBoard) {
            infoText += `Поле противника: [${this.lastClickedHexOpponentBoard.row},${this.lastClickedHexOpponentBoard.col}]`;
        }
        
        if (infoText) {
            lastClickCoords.textContent = infoText;
            lastClickInfo.style.display = 'block';
        } else {
            lastClickInfo.style.display = 'none';
        }
    }
    
    setGameMode(mode) {
        this.isOnline = mode === 'online';
        document.getElementById('onlineLobby').style.display = this.isOnline ? 'block' : 'none';
        
        document.getElementById('modeLocal').classList.toggle('active', mode === 'local');
        document.getElementById('modeOnline').classList.toggle('active', mode === 'online');

        if (mode === 'online') {
            const connectionOpen = this.connection && this.connection.open;
            this.updateSyncControls({ visible: true, enabled: connectionOpen });
            if (!connectionOpen) {
                this.updateSyncStatus('Подключитесь или создайте комнату, чтобы синхронизироваться.', 'info');
            }
        } else {
            this.updateSyncControls({ visible: false, enabled: false });
            this.updateSyncStatus();
        }
        
        if (mode === 'local') {
            this.leaveOnlineGame();
        }
    }
    
    createShipPalette() {
        const palette = document.getElementById('shipPalette');
        palette.innerHTML = '';
        
        this.ships.forEach((shipType, index) => {
            for (let i = 0; i < shipType.count; i++) {
                const shipElement = document.createElement('div');
                shipElement.className = 'ship';
                shipElement.textContent = `${shipType.name} (${shipType.size})`;
                shipElement.dataset.shipIndex = index;
                shipElement.dataset.shipInstance = i;
                
                shipElement.addEventListener('click', () => {
                    if (!shipElement.classList.contains('placed')) {
                        document.querySelectorAll('.ship').forEach(s => s.classList.remove('selected'));
                        shipElement.classList.add('selected');
                        this.selectedShip = {
                            typeIndex: index,
                            instance: i,
                            size: shipType.size
                        };
                        this.drawBoards();
                    }
                });
                
                palette.appendChild(shipElement);
            }
        });
    }
    
    // ОБЩИЙ МЕТОД ДЛЯ ВЫЧИСЛЕНИЯ КООРДИНАТ ГЕКСА
    getHexCenter(row, col, canvas) {
        const hexSize = 30; // Фиксированный размер для простоты
        const hexHeight = hexSize * Math.sqrt(3);
        const hexWidth = hexSize * 2;
        
        // Получаем реальные размеры canvas (уже с учетом DPR)
        const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
        const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
        
        const totalWidth = this.boardSize * hexWidth * 0.75 - hexWidth * 0.25;
        const totalHeight = this.boardSize * hexHeight + hexHeight * 0.5;
        
        const offsetX = (canvasWidth - totalWidth) / 2;
        const offsetY = (canvasHeight - totalHeight) / 2;
        
        const x = offsetX + col * hexWidth * 0.75 + hexWidth / 2;
        const y = offsetY + row * hexHeight + (col % 2) * hexHeight / 2 + hexHeight / 2;
        
        return { x, y, hexSize };
    }

    // УПРОЩЕННЫЙ МЕТОД ОПРЕДЕЛЕНИЯ ЯЧЕЙКИ
    getHexAtPosition(x, y, canvas) {
        // Простой перебор всех ячеек
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const center = this.getHexCenter(row, col, canvas);
                const distance = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
                
                if (distance < center.hexSize * 0.9) {
                    document.getElementById('coordsInfo').textContent = 
                        `Ячейка [${row},${col}] | Центр: [${Math.floor(center.x)},${Math.floor(center.y)}] | ` +
                        `Клик: [${Math.floor(x)},${Math.floor(y)}] | Расстояние: ${Math.floor(distance)}`;
                    return { row, col, hexX: center.x, hexY: center.y, distance };
                }
            }
        }
        
        document.getElementById('coordsInfo').textContent = 
            `Клик: [${Math.floor(x)},${Math.floor(y)}] | ЯЧЕЙКА НЕ НАЙДЕНА`;
        return null;
    }
    
    handleMyBoardClick(x, y) {
        if (this.testMode) {
            this.handleTestClick(x, y);
            return;
        }
        
        if (this.gamePhase !== 'setup') return;
        
        console.log('=== КЛИК ПО МОЕМУ ПОЛЮ ===');
        console.log('Координаты мыши:', x, y);
        console.log('Размер canvas:', this.myBoardCanvas.width, this.myBoardCanvas.height);
        
        const hex = this.getHexAtPosition(x, y, this.myBoardCanvas);
        
        const debugInfo = document.getElementById('debugInfo');
        
        if (hex) {
            console.log('Найдена ячейка:', hex.row, hex.col);
            console.log('Центр ячейки:', hex.hexX, hex.hexY);
            console.log('Расстояние:', hex.distance);
            
            debugInfo.innerHTML = `Клик: x=${Math.floor(x)}, y=${Math.floor(y)}<br>
                                  Ячейка: строка=${hex.row}, столбец=${hex.col}<br>
                                  Центр: [${Math.floor(hex.hexX)},${Math.floor(hex.hexY)}]<br>
                                  Расстояние: ${Math.floor(hex.distance)}`;
            debugInfo.style.display = 'block';
            
            // Сохраняем последний клик
            this.lastClickedHexMyBoard = hex;
            this.updateLastClickInfo();
            
            // Если выбран корабль - пытаемся разместить
            if (this.selectedShip) {
                if (this.placeShip(hex.row, hex.col, this.selectedShip, this.shipOrientation)) {
                    const shipElement = document.querySelector(`.ship[data-ship-index="${this.selectedShip.typeIndex}"][data-ship-instance="${this.selectedShip.instance}"]`);
                    if (shipElement) {
                        shipElement.classList.add('placed');
                        shipElement.classList.remove('selected');
                    }
                    
                    this.selectedShip = null;
                    this.lastHoveredHex = null;
                    this.drawBoards();
                    this.updateScores();
                    
                    if (this.allShipsPlaced()) {
                        document.getElementById('startGame').style.display = 'block';
                        this.notifyReadyState();
                    }
                } else {
                    debugInfo.innerHTML += '<br><span style="color:red">Нельзя разместить здесь!</span>';
                }
            } else {
                // Если корабль не выбран - пытаемся удалить существующий
                this.removeShipAt(hex.row, hex.col);
            }
        } else {
            debugInfo.innerHTML = `Клик: x=${Math.floor(x)}, y=${Math.floor(y)} -> вне поля`;
            debugInfo.style.display = 'block';
        }
        
        this.drawBoards();
    }
    
    handleTestClick(x, y) {
        const hex = this.getHexAtPosition(x, y, this.myBoardCanvas);
        
        if (hex) {
            this.testLines = [];
            const directions = [
                { name: "Вертикаль (↓/↑)", dirs: [0, 3] },
                { name: "Диагональ 1 (↘/↖)", dirs: [1, 4] },
                { name: "Диагональ 2 (↙/↗)", dirs: [2, 5] }
            ];
            
            directions.forEach((direction, index) => {
                const lineCells = this.getTestLine(hex.row, hex.col, direction.dirs);
                this.testLines.push({
                    name: direction.name,
                    cells: lineCells,
                    colorIndex: index
                });
            });
            
            this.displayTestResults(hex);
            this.drawBoards();
        }
    }
    
    // ПРАВИЛЬНЫЙ метод для получения тестовой линии
    getTestLine(startRow, startCol, directions) {
        const cells = [{ row: startRow, col: startCol }];
        
        // Проходим в обоих направлениях для каждой пары
        directions.forEach(dir => {
            let currentRow = startRow;
            let currentCol = startCol;
            
            // Двигаемся в одном направлении
            while (true) {
                const nextPos = this.getNextHexInDirection(currentRow, currentCol, dir);
                if (!nextPos || !this.isValidPosition(nextPos.row, nextPos.col)) break;
                
                // Проверяем, не добавили ли мы уже эту клетку
                const alreadyExists = cells.some(cell => 
                    cell.row === nextPos.row && cell.col === nextPos.col
                );
                
                if (!alreadyExists) {
                    cells.push({ row: nextPos.row, col: nextPos.col });
                } else {
                    break; // Прерываем если нашли цикл
                }
                
                currentRow = nextPos.row;
                currentCol = nextPos.col;
            }
            
            // Сбрасываем для движения в обратном направлении
            currentRow = startRow;
            currentCol = startCol;
            
            // Двигаемся в противоположном направлении (dir + 3) % 6
            const oppositeDir = (dir + 3) % 6;
            while (true) {
                const nextPos = this.getNextHexInDirection(currentRow, currentCol, oppositeDir);
                if (!nextPos || !this.isValidPosition(nextPos.row, nextPos.col)) break;
                
                // Проверяем, не добавили ли мы уже эту клетку
                const alreadyExists = cells.some(cell => 
                    cell.row === nextPos.row && cell.col === nextPos.col
                );
                
                if (!alreadyExists) {
                    cells.push({ row: nextPos.row, col: nextPos.col });
                } else {
                    break; // Прерываем если нашли цикл
                }
                
                currentRow = nextPos.row;
                currentCol = nextPos.col;
            }
        });
        
        return cells;
    }
    
    // ПРАВИЛЬНЫЕ направления для гексагональной сетки (без чередования)
    getNextHexInDirection(row, col, direction) {
        // ПРАВИЛЬНЫЕ направления для гексагональной сетки с учетом четности столбца
        const directions = [
            // 0: Вертикаль вниз (↓)
            () => ({ row: row + 1, col: col }),
            
            // 1: Диагональ 1 (↘)
            () => {
                if (col % 2 === 0) {
                    // Четные столбцы: вправо-вниз
                    return { row: row, col: col + 1 };
                } else {
                    // Нечетные столбцы: вправо-вниз
                    return { row: row + 1, col: col + 1 };
                }
            },
            
            // 2: Диагональ 2 (↙)
            () => {
                if (col % 2 === 0) {
                    // Четные столбцы: вправо-вверх
                    return { row: row - 1, col: col + 1 };
                } else {
                    // Нечетные столбцы: вправо
                    return { row: row, col: col + 1 };
                }
            },
            
            // 3: Вертикаль вверх (↑)
            () => ({ row: row - 1, col: col }),
            
            // 4: Диагональ 1 противоположное (↖)
            () => {
                if (col % 2 === 0) {
                    // Четные столбцы: влево-вверх
                    return { row: row - 1, col: col - 1 };
                } else {
                    // Нечетные столбцы: влево
                    return { row: row, col: col - 1 };
                }
            },
            
            // 5: Диагональ 2 противоположное (↗)
            () => {
                if (col % 2 === 0) {
                    // Четные столбцы: влево
                    return { row: row, col: col - 1 };
                } else {
                    // Нечетные столбцы: влево-вниз
                    return { row: row + 1, col: col - 1 };
                }
            }
        ];
        
        if (direction < directions.length) {
            return directions[direction]();
        }
        return null;
    }
    
    displayTestResults(hex) {
        const resultsDiv = document.getElementById('testResults');
        resultsDiv.innerHTML = '';
        
        const header = document.createElement('div');
        header.innerHTML = `<strong>Центральная клетка: [${hex.row},${hex.col}] (${hex.col % 2 === 0 ? 'четный' : 'нечетный'})</strong>`;
        resultsDiv.appendChild(header);
        
        this.testLines.forEach((line, index) => {
            const lineDiv = document.createElement('div');
            lineDiv.className = `test-line line-${index}`;
            
            // Сортируем клетки для красивого отображения
            const sortedCells = [...line.cells].sort((a, b) => {
                if (a.row !== b.row) return a.row - b.row;
                return a.col - b.col;
            });
            
            const cellsText = sortedCells.map(cell => `[${cell.row},${cell.col}]`).join(' → ');
            lineDiv.innerHTML = `
                <strong>${line.name}:</strong><br>
                Клетки: ${cellsText}<br>
                Длина: ${line.cells.length} клеток
            `;
            
            resultsDiv.appendChild(lineDiv);
        });
    }
    
    handleOpponentBoardClick(x, y) {
        if (this.gamePhase !== 'battle' || this.currentPlayer !== 'me') return;
        
        console.log(`Клик по полю противника: x=${x}, y=${y}`);
        
        const hex = this.getHexAtPosition(x, y, this.opponentBoardCanvas);
        
        const debugInfo = document.getElementById('debugInfo');
        if (hex) {
            console.log(`Найдена ячейка: row=${hex.row}, col=${hex.col}`);
            debugInfo.innerHTML = `Выстрел: x=${Math.floor(x)}, y=${Math.floor(y)}<br>
                                  Ячейка: строка=${hex.row}, столбец=${hex.col}<br>
                                  Центр: [${Math.floor(hex.hexX)},${Math.floor(hex.hexY)}]<br>
                                  Расстояние: ${Math.floor(hex.distance)}`;
            debugInfo.style.display = 'block';
            
            // Сохраняем последний клик
            this.lastClickedHexOpponentBoard = hex;
            this.updateLastClickInfo();
        } else {
            debugInfo.innerHTML = `Выстрел: x=${Math.floor(x)}, y=${Math.floor(y)} -> вне поля`;
            debugInfo.style.display = 'block';
        }
        
        if (hex && !this.isAlreadyShot(hex.row, hex.col, this.myShots)) {
            this.makeShot(hex.row, hex.col);
        }
        
        this.drawBoards();
    }
    
    // ПРАВИЛЬНЫЕ направления для размещения кораблей (используют ту же логику что и тестовый режим)
    getShipPositions(row, col, size, orientation) {
        const positions = [{ row, col }];
        let currentRow = row;
        let currentCol = col;
        
        for (let i = 1; i < size; i++) {
            const nextPos = this.getNextHexInDirection(currentRow, currentCol, orientation);
            
            if (!nextPos || !this.isValidPosition(nextPos.row, nextPos.col)) {
                return null;
            }
            
            positions.push({ row: nextPos.row, col: nextPos.col });
            currentRow = nextPos.row;
            currentCol = nextPos.col;
        }
        
        return positions;
    }
    
    isValidPosition(row, col) {
        return row >= 0 && row < this.boardSize && col >= 0 && col < this.boardSize;
    }
    
    // ПРАВИЛЬНАЯ ПРОВЕРКА СОСЕДНИХ КЛЕТОК ДЛЯ ГЕКСАГОНАЛЬНОЙ СЕТКИ
    getNeighborCells(row, col) {
        const neighbors = [];
        
        // Все 6 направлений для гексагональной сетки
        for (let direction = 0; direction < 6; direction++) {
            const neighbor = this.getNextHexInDirection(row, col, direction);
            if (neighbor && this.isValidPosition(neighbor.row, neighbor.col)) {
                neighbors.push(neighbor);
            }
        }
        
        return neighbors;
    }

    // ПРОВЕРКА ВОЗМОЖНОСТИ РАЗМЕЩЕНИЯ КОРАБЛЯ (БЕЗ КАСАНИЯ ДРУГИХ КОРАБЛЕЙ)
    canPlaceShip(positions) {
        // Проверяем что все клетки корабля свободны
        for (const pos of positions) {
            if (!this.isValidPosition(pos.row, pos.col) || this.myBoard[pos.row][pos.col] !== '') {
                return false;
            }
        }
        
        // Создаем множество всех запрещенных клеток (сам корабль + все его соседи)
        const forbiddenCells = new Set();
        
        // Добавляем все клетки корабля и всех их соседей
        for (const pos of positions) {
            // Добавляем саму клетку корабля
            const cellKey = `${pos.row},${pos.col}`;
            forbiddenCells.add(cellKey);
            
            // Добавляем всех соседей этой клетки
            const neighbors = this.getNeighborCells(pos.row, pos.col);
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.row},${neighbor.col}`;
                forbiddenCells.add(neighborKey);
            }
        }
        
        // Проверяем что среди запрещенных клеток нет других кораблей
        for (const key of forbiddenCells) {
            const [r, c] = key.split(',').map(Number);
            
            // Проверяем что эта клетка не является частью текущего корабля
            const isPartOfCurrentShip = positions.some(pos => 
                pos.row === r && pos.col === c
            );
            
            // Если клетка не часть текущего корабля, но занята другим кораблем - нельзя разместить
            if (!isPartOfCurrentShip && this.myBoard[r][c] === 'ship') {
                return false;
            }
        }
        
        return true;
    }
    
    placeShip(row, col, ship, orientation) {
        const positions = this.getShipPositions(row, col, ship.size, orientation);
        
        if (!positions) return false;
        
        if (!this.canPlaceShip(positions)) {
            return false;
        }
        
        const shipData = {
            positions: positions,
            hits: Array(ship.size).fill(false),
            size: ship.size,
            typeIndex: ship.typeIndex,
            instance: ship.instance
        };
        
        for (const pos of positions) {
            this.myBoard[pos.row][pos.col] = 'ship';
        }
        
        this.myShips.push(shipData);
        return true;
    }
    
    removeShipAt(row, col) {
        if (this.myBoard[row][col] !== 'ship') return;
        
        const shipIndex = this.myShips.findIndex(ship => 
            ship.positions.some(pos => pos.row === row && pos.col === col)
        );
        
        if (shipIndex !== -1) {
            const ship = this.myShips[shipIndex];
            
            for (const pos of ship.positions) {
                this.myBoard[pos.row][pos.col] = '';
            }
            
            this.myShips.splice(shipIndex, 1);
            this.updateShipPalette();
            
            this.drawBoards();
            this.updateScores();
            
            if (!this.allShipsPlaced()) {
                document.getElementById('startGame').style.display = 'none';
            }
        }
    }
    
    updateShipPalette() {
        const palette = document.getElementById('shipPalette');
        const shipElements = palette.querySelectorAll('.ship');
        
        shipElements.forEach(shipElement => {
            shipElement.classList.remove('placed');
        });
        
        this.myShips.forEach(ship => {
            const shipElement = document.querySelector(
                `.ship[data-ship-index="${ship.typeIndex}"][data-ship-instance="${ship.instance}"]`
            );
            if (shipElement) {
                shipElement.classList.add('placed');
            }
        });
    }
    
    randomizeShips() {
        this.initializeGame();
        
        let totalAttempts = 0;
        const MAX_TOTAL_ATTEMPTS = 2000; // Общее ограничение попыток
        
        this.ships.forEach((shipType, typeIndex) => {
            for (let i = 0; i < shipType.count; i++) {
                let placed = false;
                let attempts = 0;
                const MAX_ATTEMPTS_PER_SHIP = 200; // Ограничение попыток на один корабль
                
                while (!placed && attempts < MAX_ATTEMPTS_PER_SHIP && totalAttempts < MAX_TOTAL_ATTEMPTS) {
                    const row = Math.floor(Math.random() * this.boardSize);
                    const col = Math.floor(Math.random() * this.boardSize);
                    const orientation = Math.floor(Math.random() * 6);
                    
                    const ship = {
                        typeIndex: typeIndex,
                        instance: i,
                        size: shipType.size
                    };
                    
                    const positions = this.getShipPositions(row, col, ship.size, orientation);
                    
                    if (positions && this.canPlaceShip(positions)) {
                        const shipData = {
                            positions: positions,
                            hits: Array(shipType.size).fill(false),
                            size: shipType.size,
                            typeIndex: typeIndex,
                            instance: i
                        };
                        
                        for (const pos of positions) {
                            this.myBoard[pos.row][pos.col] = 'ship';
                        }
                        
                        this.myShips.push(shipData);
                        placed = true;
                    }
                    attempts++;
                    totalAttempts++;
                }
                
                if (!placed) {
                    console.warn(`Не удалось разместить корабль ${shipType.name} (${shipType.size}) после ${attempts} попыток`);
                }
            }
        });
        
        this.createShipPalette();
        this.drawBoards();
        this.updateScores();
        
        if (this.allShipsPlaced()) {
            document.getElementById('startGame').style.display = 'block';
            this.notifyReadyState();
        } else {
            console.warn("Не все корабли удалось разместить автоматически");
        }
    }
    
    // МЕТОД ДЛЯ АВТОМАТИЧЕСКОГО РАЗМЕЩЕНИЯ КОРАБЛЕЙ БОТА
    randomizeOpponentShips() {
        this.opponentBoard = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(''));
        this.opponentShips = [];
        
        let totalAttempts = 0;
        const MAX_TOTAL_ATTEMPTS = 2000;
        
        this.ships.forEach((shipType, typeIndex) => {
            for (let i = 0; i < shipType.count; i++) {
                let placed = false;
                let attempts = 0;
                const MAX_ATTEMPTS_PER_SHIP = 200;
                
                while (!placed && attempts < MAX_ATTEMPTS_PER_SHIP && totalAttempts < MAX_TOTAL_ATTEMPTS) {
                    const row = Math.floor(Math.random() * this.boardSize);
                    const col = Math.floor(Math.random() * this.boardSize);
                    const orientation = Math.floor(Math.random() * 6);
                    
                    const ship = {
                        typeIndex: typeIndex,
                        instance: i,
                        size: shipType.size
                    };
                    
                    const positions = this.getShipPositions(row, col, ship.size, orientation);
                    
                    if (positions && this.canPlaceShipOpponent(positions)) {
                        const shipData = {
                            positions: positions,
                            hits: Array(shipType.size).fill(false),
                            size: shipType.size,
                            typeIndex: typeIndex,
                            instance: i
                        };
                        
                        for (const pos of positions) {
                            this.opponentBoard[pos.row][pos.col] = 'ship';
                        }
                        
                        this.opponentShips.push(shipData);
                        placed = true;
                    }
                    attempts++;
                    totalAttempts++;
                }
                
                if (!placed) {
                    console.warn(`Бот: не удалось разместить корабль ${shipType.name} (${shipType.size}) после ${attempts} попыток`);
                }
            }
        });
    }
    
    // ПРОВЕРКА ВОЗМОЖНОСТИ РАЗМЕЩЕНИЯ КОРАБЛЯ ДЛЯ БОта
    canPlaceShipOpponent(positions) {
        // Проверяем что все клетки корабля свободны
        for (const pos of positions) {
            if (!this.isValidPosition(pos.row, pos.col) || this.opponentBoard[pos.row][pos.col] !== '') {
                return false;
            }
        }
        
        // Создаем множество всех запрещенных клеток (сам корабль + все его соседи)
        const forbiddenCells = new Set();
        
        // Добавляем все клетки корабля и всех их соседей
        for (const pos of positions) {
            // Добавляем саму клетку корабля
            const cellKey = `${pos.row},${pos.col}`;
            forbiddenCells.add(cellKey);
            
            // Добавляем всех соседей этой клетки
            const neighbors = this.getNeighborCells(pos.row, pos.col);
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.row},${neighbor.col}`;
                forbiddenCells.add(neighborKey);
            }
        }
        
        // Проверяем что среди запрещенных клеток нет других кораблей
        for (const key of forbiddenCells) {
            const [r, c] = key.split(',').map(Number);
            
            // Проверяем что эта клетка не является частью текущего корабля
            const isPartOfCurrentShip = positions.some(pos => 
                pos.row === r && pos.col === c
            );
            
            // Если клетка не часть текущего корабля, но занята другим кораблем - нельзя разместить
            if (!isPartOfCurrentShip && this.opponentBoard[r][c] === 'ship') {
                return false;
            }
        }
        
        return true;
    }
    
    allShipsPlaced() {
        let totalShips = 0;
        this.ships.forEach(shipType => {
            totalShips += shipType.count;
        });
        
        return this.myShips.length === totalShips;
    }
    
    startBattle({ fromNetwork = false, activeRole = null } = {}) {
        if (!fromNetwork && !this.allShipsPlaced()) return;
        
        // В локальном режиме автоматически размещаем корабли бота
        if (!this.isOnline) {
            this.randomizeOpponentShips();
        }
        
        this.gamePhase = 'battle';
        
        if (this.isOnline) {
            const roleToPlay = activeRole || (this.isHost ? 'host' : 'client');
            this.currentPlayer = this.mapRoleToPerspective(roleToPlay);
        } else {
            this.currentPlayer = 'me';
        }
        
        this.updateGamePhase();
        this.drawBoards();
        
        if (this.isOnline && !fromNetwork) {
            this.sendData({
                type: 'start_battle',
                activeRole: this.getActivePlayerRole()
            });
        }
    }
    
    makeShot(row, col) {
        if (this.gamePhase !== 'battle') return;
        
        this.myShots.push({ row, col });
        
        let hit = false;
        let sunkShip = null;
        
        for (const ship of this.opponentShips) {
            for (let i = 0; i < ship.positions.length; i++) {
                const pos = ship.positions[i];
                if (pos.row === row && pos.col === col) {
                    hit = true;
                    ship.hits[i] = true;
                    
                    if (ship.hits.every(h => h)) {
                        sunkShip = ship;
                        // ПОМЕЧАЕМ ЗАПРЕЩЕННЫЕ КЛЕТКИ ДЛЯ ИГРОКА ВОКРУГ ПОТОПЛЕННОГО КОРАБЛЯ
                        this.markPlayerForbiddenCellsAroundShip(ship);
                    }
                    break;
                }
            }
            if (hit) break;
        }
        
        this.opponentBoard[row][col] = hit ? 'hit' : 'miss';
        
        this.drawBoards();
        this.updateScores();
        
        if (this.checkGameOver()) {
            this.gamePhase = 'gameover';
            this.updateGamePhase();
            setTimeout(() => alert('Вы победили!'), 100);
            return;
        }
        
        if (this.isOnline) {
            this.currentPlayer = 'opponent';
            this.updateGamePhase();
            this.sendData({
                type: 'shot',
                row,
                col,
                hit,
                sunkShip,
                nextRole: this.getActivePlayerRole()
            });
        } else {
            this.currentPlayer = 'opponent';
            this.updateGamePhase();
            setTimeout(() => this.makeBotMove(), 800);
        }
    }
    
    // УМНЫЙ МЕТОД ХОДА БОТА С УЧЕТОМ ПРАВИЛ КАСАНИЯ КОРАБЛЕЙ
    makeBotMove() {
        if (this.gamePhase !== 'battle' || this.currentPlayer !== 'opponent') return;
        
        let target = this.findSmartBotTarget();
        
        if (target) {
            setTimeout(() => {
                this.receiveBotShot(target.row, target.col);
            }, 800);
        }
    }
    
    // УМНЫЙ ПОИСК ЦЕЛИ ДЛЯ БОТА
    findSmartBotTarget() {
        // 1. Если есть незавершенная цель, продолжаем ее преследовать
        if (this.botLastHit && this.botCurrentDirection !== null) {
            const nextTarget = this.getNextInDirection(this.botLastHit.row, this.botLastHit.col, this.botCurrentDirection);
            if (nextTarget && this.isValidBotTarget(nextTarget.row, nextTarget.col)) {
                return nextTarget;
            } else {
                // Пробуем противоположное направление
                this.botCurrentDirection = (this.botCurrentDirection + 3) % 6;
                const oppositeTarget = this.getNextInDirection(this.botHitSequence[0].row, this.botHitSequence[0].col, this.botCurrentDirection);
                if (oppositeTarget && this.isValidBotTarget(oppositeTarget.row, oppositeTarget.col)) {
                    return oppositeTarget;
                } else {
                    // Если оба направления заблокированы, ищем новое направление
                    this.findNewSmartDirection();
                    return this.findSmartBotTarget(); // Рекурсивно ищем новую цель
                }
            }
        }
        
        // 2. Если есть попадание, но нет направления, ищем новое направление
        if (this.botLastHit) {
            this.findNewSmartDirection();
            const target = this.findSmartBotTarget();
            if (target) return target;
        }
        
        // 3. Поиск стратегических целей (приоритет непосещенных клеток)
        const strategicTargets = this.findStrategicTargets();
        if (strategicTargets.length > 0) {
            return strategicTargets[Math.floor(Math.random() * strategicTargets.length)];
        }
        
        // 4. Резервный вариант: случайная доступная клетка
        return this.findRandomAvailableCell();
    }
    
    // ПРОВЕРКА ВАЛИДНОСТИ ЦЕЛИ ДЛЯ БОТА
    isValidBotTarget(row, col) {
        // Проверяем, что клетка в пределах доски
        if (!this.isValidPosition(row, col)) return false;
        
        // Проверяем, что в эту клетку еще не стреляли
        if (this.isAlreadyShot(row, col, this.opponentShots)) return false;
        
        // Проверяем, что клетка не запрещена для стрельбы (не рядом с потопленным кораблем)
        if (this.botForbiddenCells.has(`${row},${col}`)) return false;
        
        return true;
    }
    
    // УМНЫЙ ПОИСК НОВОГО НАПРАВЛЕНИЯ
    findNewSmartDirection() {
        const directions = this.shuffleArray([0, 1, 2, 3, 4, 5]);
        
        for (const dir of directions) {
            const target = this.getNextInDirection(this.botLastHit.row, this.botLastHit.col, dir);
            if (target && this.isValidBotTarget(target.row, target.col)) {
                this.botCurrentDirection = dir;
                return;
            }
        }
        
        // Если не нашли подходящее направление, сбрасываем состояние
        this.botLastHit = null;
        this.botCurrentDirection = null;
        this.botHitSequence = [];
    }
    
    // ПОИСК СТРАТЕГИЧЕСКИХ ЦЕЛЕЙ
    findStrategicTargets() {
        const strategicTargets = [];
        
        // Сначала ищем клетки, которые могут быть частью кораблей
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.isValidBotTarget(row, col)) {
                    // Даем приоритет клеткам, у которых есть соседи-попадания
                    if (this.hasHitNeighbors(row, col)) {
                        strategicTargets.push({ row, col, priority: 3 });
                    }
                    // Средний приоритет - клетки в "перспективных" зонах
                    else if (this.isInPromisingZone(row, col)) {
                        strategicTargets.push({ row, col, priority: 2 });
                    }
                    // Низкий приоритет - все остальные доступные клетки
                    else {
                        strategicTargets.push({ row, col, priority: 1 });
                    }
                }
            }
        }
        
        // Сортируем по приоритету и возвращаем только координаты
        return strategicTargets
            .sort((a, b) => b.priority - a.priority)
            .map(target => ({ row: target.row, col: target.col }));
    }
    
    // ПОИСК СЛУЧАЙНОЙ ДОСТУПНОЙ КЛЕТКИ
    findRandomAvailableCell() {
        const availableCells = [];
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                if (this.isValidBotTarget(row, col)) {
                    availableCells.push({ row, col });
                }
            }
        }
        
        if (availableCells.length > 0) {
            return availableCells[Math.floor(Math.random() * availableCells.length)];
        }
        
        return null;
    }
    
    // ПРОВЕРКА ЕСТЬ ЛИ СОСЕДНИЕ КЛЕТКИ С ПОПАДАНИЯМИ
    hasHitNeighbors(row, col) {
        const neighbors = this.getNeighborCells(row, col);
        return neighbors.some(neighbor => 
            this.myBoard[neighbor.row][neighbor.col] === 'hit'
        );
    }
    
    // ПРОВЕРКА НАХОДИТСЯ ЛИ КЛЕТКА В ПЕРСПЕКТИВНОЙ ЗОНЕ
    isInPromisingZone(row, col) {
        // Перспективные зоны - где еще могут быть корабли
        // Например, клетки на определенном расстоянии от краев
        const margin = 2;
        return row >= margin && row < this.boardSize - margin && 
               col >= margin && col < this.boardSize - margin;
    }
    
    // ПОЛУЧЕНИЕ СЛЕДУЮЩЕЙ КЛЕТКИ В НАПРАВЛЕНИИ
    getNextInDirection(row, col, direction) {
        const nextPos = this.getNextHexInDirection(row, col, direction);
        if (nextPos && this.isValidPosition(nextPos.row, nextPos.col)) {
            return nextPos;
        }
        return null;
    }
    
    // ПОМЕТКА КЛЕТОК ВОКРУГ ПОТОПЛЕННОГО КОРАБЛЯ КАК ЗАПРЕЩЕННЫХ ДЛЯ БОТА
    markForbiddenCellsAroundShip(ship) {
        // Для каждой клетки корабля добавляем все соседние клетки в запрещенные
        for (const pos of ship.positions) {
            // Добавляем саму клетку корабля (хотя в нее уже стреляли)
            this.botForbiddenCells.add(`${pos.row},${pos.col}`);
            
            // Добавляем всех соседей
            const neighbors = this.getNeighborCells(pos.row, pos.col);
            for (const neighbor of neighbors) {
                this.botForbiddenCells.add(`${neighbor.row},${neighbor.col}`);
            }
        }
        
        console.log(`Бот: помечено ${this.botForbiddenCells.size} запрещенных клеток вокруг потопленного корабля`);
    }
    
    // НОВЫЙ МЕТОД: ПОМЕТКА КЛЕТОК ВОКРУГ ПОТОПЛЕННОГО КОРАБЛЯ ДЛЯ ИГРОКА
    markPlayerForbiddenCellsAroundShip(ship) {
        // Для каждой клетки корабля добавляем все соседние клетки в запрещенные
        for (const pos of ship.positions) {
            // Добавляем саму клетку корабля (хотя в нее уже стреляли)
            this.playerForbiddenCells.add(`${pos.row},${pos.col}`);
            
            // Добавляем всех соседей
            const neighbors = this.getNeighborCells(pos.row, pos.col);
            for (const neighbor of neighbors) {
                this.playerForbiddenCells.add(`${neighbor.row},${neighbor.col}`);
            }
        }
        
        console.log(`Игрок: помечено ${this.playerForbiddenCells.size} запрещенных клеток вокруг потопленного корабля`);
    }
    
    // ПЕРЕМЕШИВАНИЕ МАССИВА
    shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }
    
    // ОБРАБОТКА ВЫСТРЕЛА БОТА С УЧЕТОМ ЗАПРЕЩЕННЫХ КЛЕТОК
    receiveBotShot(row, col) {
        this.opponentShots.push({ row, col });
        
        let hit = false;
        let sunkShip = null;
        
        for (const ship of this.myShips) {
            for (let i = 0; i < ship.positions.length; i++) {
                const pos = ship.positions[i];
                if (pos.row === row && pos.col === col) {
                    hit = true;
                    ship.hits[i] = true;
                    
                    // Обновляем логику бота при попадании
                    if (hit) {
                        if (!this.botLastHit) {
                            // Первое попадание
                            this.botLastHit = { row, col };
                            this.botHitSequence = [{ row, col }];
                            this.botHuntMode = false; // Переходим в режим преследования
                        } else {
                            // Последующие попадания
                            this.botLastHit = { row, col };
                            this.botHitSequence.push({ row, col });
                        }
                    }
                    
                    // Проверяем, потоплен ли корабль
                    if (ship.hits.every(h => h)) {
                        sunkShip = ship;
                        // Если корабль потоплен, помечаем клетки вокруг как запрещенные
                        this.markForbiddenCellsAroundShip(ship);
                        this.botSunkShips.push(ship);
                        
                        // Сбрасываем режим преследования
                        this.botLastHit = null;
                        this.botCurrentDirection = null;
                        this.botHitSequence = [];
                        this.botHuntMode = true; // Возвращаемся в режим охоты
                    }
                    break;
                }
            }
            if (hit) break;
        }
        
        this.myBoard[row][col] = hit ? 'hit' : 'miss';
        
        this.drawBoards();
        this.updateScores();
        
        if (this.checkGameOver()) {
            this.gamePhase = 'gameover';
            this.updateGamePhase();
            setTimeout(() => alert('Противник победил!'), 100);
            return;
        }
        
        this.currentPlayer = 'me';
        this.updateGamePhase();
    }
    
    // СТАРЫЙ МЕТОД ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
    receiveShot(row, col, nextRole = null) {
        if (this.isOnline) {
            // Онлайн-логика
            this.opponentShots.push({ row, col });
            
            let hit = false;
            let sunkShip = null;
            
            for (const ship of this.myShips) {
                for (let i = 0; i < ship.positions.length; i++) {
                    const pos = ship.positions[i];
                    if (pos.row === row && pos.col === col) {
                        hit = true;
                        ship.hits[i] = true;
                        
                        if (ship.hits.every(h => h)) {
                            sunkShip = ship;
                        }
                        break;
                    }
                }
                if (hit) break;
            }
            
            this.myBoard[row][col] = hit ? 'hit' : 'miss';
            
            this.drawBoards();
            this.updateScores();
            
            if (this.checkGameOver()) {
                this.gamePhase = 'gameover';
                this.updateGamePhase();
                setTimeout(() => alert('Противник победил!'), 100);
                return;
            }
            
            if (this.isOnline) {
                const nextRoleToSend = this.getMyRole();
                this.sendData({
                    type: 'shot_result',
                    row,
                    col,
                    hit,
                    sunkShip,
                    nextRole: nextRoleToSend
                });
            }

            this.currentPlayer = nextRole ? this.mapRoleToPerspective(nextRole) : 'me';
            this.updateGamePhase();
        }
    }
    
    isAlreadyShot(row, col, shots) {
        return shots.some(shot => shot.row === row && shot.col === col);
    }
    
    checkGameOver() {
        const myShipsSunk = this.myShips.every(ship => ship.hits.every(h => h));
        const opponentShipsSunk = this.opponentShips.every(ship => ship.hits.every(h => h));
        
        return myShipsSunk || opponentShipsSunk;
    }
    
    updateGamePhase() {
        const phaseElement = document.getElementById('gamePhase');
        
        switch (this.gamePhase) {
            case 'setup':
                phaseElement.textContent = 'Фаза расстановки кораблей';
                break;
            case 'battle':
                if (this.isOnline) {
                    phaseElement.textContent = `Фаза боя - Ход: ${this.currentPlayer === 'me' ? 'Ваш' : 'Противника'}`;
                } else {
                    phaseElement.textContent = `Фаза боя - Ход: ${this.currentPlayer === 'me' ? 'Ваш' : 'Бота'}`;
                }
                break;
            case 'gameover':
                phaseElement.textContent = 'Игра завершена';
                break;
        }
        
        document.getElementById('playerMe').classList.toggle('active', this.currentPlayer === 'me');
        document.getElementById('playerOpponent').classList.toggle('active', this.currentPlayer === 'opponent');
        
        // Подсветка canvas в зависимости от хода
        this.highlightCurrentPlayer();
    }
    
    // ПОДСВЕТКА ТЕКУЩЕГО ИГРОКА
    highlightCurrentPlayer() {
        const myBoard = document.getElementById('myBoard');
        const opponentBoard = document.getElementById('opponentBoard');
        
        // Сбрасываем подсветку
        myBoard.style.boxShadow = 'none';
        opponentBoard.style.boxShadow = 'none';
        
        if (this.gamePhase === 'battle') {
            if (this.currentPlayer === 'me') {
                // Подсвечиваем поле противника (куда игрок должен стрелять)
                opponentBoard.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.5)';
            } else {
                // Подсвечиваем поле игрока (где бот стреляет)
                myBoard.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.5)';
            }
        }
    }
    
    updateScores() {
        const myAliveShips = this.myShips.filter(ship => !ship.hits.every(h => h)).length;
        const opponentAliveShips = this.opponentShips.filter(ship => !ship.hits.every(h => h)).length;
        
        this.setScore(document.getElementById('scoreMe'), myAliveShips);
        this.setScore(document.getElementById('scoreOpponent'), opponentAliveShips);
    }

    setScore(element, value) {
        if (!element) {
            return;
        }
        element.innerHTML = `<span class="score-number">${value}</span><span class="score-label">кораблей</span>`;
    }
    
    drawBoards() {
        this.drawBoard(this.myCtx, this.myBoardCanvas, this.myBoard, this.myShips, true);
        this.drawBoard(this.opponentCtx, this.opponentBoardCanvas, this.opponentBoard, this.opponentShips, false);
        
        // Обновляем подсветку текущего игрока
        this.highlightCurrentPlayer();
    }
    
    drawBoard(ctx, canvas, board, ships, showShips) {
        // Получаем реальные размеры canvas (уже с учетом DPR)
        const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
        const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
        
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Создаем множество клеток потопленных кораблей
        const sunkCells = new Set();
        ships.forEach(ship => {
            if (ship.hits.every(h => h)) {
                ship.positions.forEach(pos => {
                    sunkCells.add(`${pos.row},${pos.col}`);
                });
            }
        });
        
        // ОТЛАДКА: информация о размерах
        if (this.showTouchZones) {
            ctx.fillStyle = 'red';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`Canvas: ${Math.floor(canvasWidth)}x${Math.floor(canvasHeight)}`, 10, 15);
            
            // Отображаем количество запрещенных клеток
            if (showShips) {
                ctx.fillText(`Запрещенных клеток бота: ${this.botForbiddenCells.size}`, 10, 30);
            } else {
                ctx.fillText(`Запрещенных клеток игрока: ${this.playerForbiddenCells.size}`, 10, 30);
            }
        }
        
        // Рисуем все гексы используя ОДИН метод вычисления координат
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const center = this.getHexCenter(row, col, canvas);
                const isLastClicked = 
                    (showShips && this.lastClickedHexMyBoard && 
                     this.lastClickedHexMyBoard.row === row && this.lastClickedHexMyBoard.col === col) ||
                    (!showShips && this.lastClickedHexOpponentBoard && 
                     this.lastClickedHexOpponentBoard.row === row && this.lastClickedHexOpponentBoard.col === col);
                
                // Определяем состояние клетки с учетом потопленных кораблей
                let cellState = board[row][col];
                if (cellState === 'hit' && sunkCells.has(`${row},${col}`)) {
                    cellState = 'sunk';
                }
                
                // ОПРЕДЕЛЯЕМ ЯВЛЯЕТСЯ ЛИ КЛЕТКА ЗАПРЕЩЕННОЙ
                let isForbidden = false;
                if (showShips) {
                    // На поле игрока показываем клетки, запрещенные для бота
                    isForbidden = this.botForbiddenCells.has(`${row},${col}`);
                } else {
                    // На поле противника показываем клетки, запрещенные для игрока
                    isForbidden = this.playerForbiddenCells.has(`${row},${col}`);
                }
                
                this.drawHex(ctx, center.x, center.y, center.hexSize, cellState, showShips, row, col, isLastClicked, isForbidden);
                
                // ОТЛАДКА: центры и зоны клика
                if (this.showTouchZones) {
                    // Красная точка в центре
                    ctx.fillStyle = 'red';
                    ctx.beginPath();
                    ctx.arc(center.x, center.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Зеленая зона клика
                    ctx.strokeStyle = 'lime';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(center.x, center.y, center.hexSize * 0.9, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    // Координаты
                    ctx.fillStyle = 'yellow';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${row},${col}`, center.x, center.y - 15);
                }
            }
        }
        
        // Отрисовываем тестовые линии если в тестовом режиме
        if (this.testMode && showShips && this.testLines.length > 0) {
            this.drawTestLines(ctx, canvas);
        }
        
        // Предпросмотр корабля
        if (this.gamePhase === 'setup' && this.selectedShip && showShips && this.lastHoveredHex) {
            const positions = this.getShipPositions(this.lastHoveredHex.row, this.lastHoveredHex.col, this.selectedShip.size, this.shipOrientation);
            
            if (positions && positions.length === this.selectedShip.size) { // Проверяем что получили все клетки
                let valid = this.canPlaceShip(positions);
                
                ctx.globalAlpha = 0.6;
                for (const pos of positions) {
                    const center = this.getHexCenter(pos.row, pos.col, canvas);
                    this.drawHex(ctx, center.x, center.y, center.hexSize, valid ? 'ship-preview' : 'invalid-preview', showShips, pos.row, pos.col, false, false);
                }
                ctx.globalAlpha = 1.0;
                
                // Отладочная информация
                if (this.showTouchZones) {
                    ctx.fillStyle = valid ? 'lime' : 'red';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(`Корабль: ${positions.length} из ${this.selectedShip.size} клеток`, 10, 45);
                }
            }
        }
    }
    
    drawTestLines(ctx, canvas) {
        this.testLines.forEach((line, lineIndex) => {
            const colors = ['#ff0000', '#00ff00', '#0000ff'];
            const color = colors[lineIndex];
            
            line.cells.forEach(cell => {
                const center = this.getHexCenter(cell.row, cell.col, canvas);
                
                // Рисуем подсветку для тестовой клетки
                ctx.fillStyle = color + '40'; // прозрачный цвет
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = Math.PI / 3 * i;
                    const hexX = center.x + center.hexSize * Math.cos(angle);
                    const hexY = center.y + center.hexSize * Math.sin(angle);
                    if (i === 0) ctx.moveTo(hexX, hexY);
                    else ctx.lineTo(hexX, hexY);
                }
                ctx.closePath();
                ctx.fill();
                
                // Обводим границу
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Добавляем номер линии
                ctx.fillStyle = color;
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(lineIndex.toString(), center.x, center.y);
            });
        });
    }
    
    // ОБНОВЛЕННЫЙ drawHex С ПОДДЕРЖКОЙ ЗАПРЕЩЕННЫХ КЛЕТОК
    drawHex(ctx, x, y, hexSize, state, showShips, row, col, isLastClicked, isForbidden) {
        // Рисуем шестиугольник
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i;
            const hexX = x + hexSize * Math.cos(angle);
            const hexY = y + hexSize * Math.sin(angle);
            if (i === 0) ctx.moveTo(hexX, hexY);
            else ctx.lineTo(hexX, hexY);
        }
        ctx.closePath();
        
        // ЕСЛИ КЛЕТКА ЗАПРЕЩЕННАЯ И РЕЖИМ ПОКАЗА ВКЛЮЧЕН - ОСОБАЯ ЗАЛИВКА
        if (isForbidden && this.showForbiddenCells) {
            ctx.fillStyle = 'rgba(128, 0, 128, 0.3)'; // Фиолетовый с прозрачностью
            ctx.fill();
        }
        
        // Подсветка последней нажатой ячейки
        if (isLastClicked) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
            ctx.fill();
        }
        
        switch (state) {
            case 'ship':
                if (showShips) {
                    ctx.fillStyle = '#4CAF50';
                } else {
                    // Скрываем корабли противника
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                }
                break;
            case 'hit':
                ctx.fillStyle = '#FF5252';
                break;
            case 'sunk':
                ctx.fillStyle = '#8B0000'; // Темно-красный для потопленных кораблей
                break;
            case 'miss':
                ctx.fillStyle = '#2196F3';
                break;
            case 'ship-preview':
                ctx.fillStyle = 'rgba(76, 175, 80, 0.4)';
                break;
            case 'invalid-preview':
                ctx.fillStyle = 'rgba(255, 82, 82, 0.4)';
                break;
            default:
                ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        }
        
        // ЗАЛИВКА ОСНОВНОГО ЦВЕТА ТОЛЬКО ЕСЛИ НЕ ЗАПРЕЩЕННАЯ КЛЕТКА И НЕ ПОСЛЕДНИЙ КЛИК
        if (!isLastClicked && !(isForbidden && this.showForbiddenCells)) {
            ctx.fill();
        }
        
        ctx.strokeStyle = isLastClicked ? '#FFD700' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = isLastClicked ? 3 : 1;
        ctx.stroke();
        
        // Добавляем индексы в каждую клетку
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${row},${col}`, x, y);
        
        // ЕСЛИ КЛЕТКА ЗАПРЕЩЕННАЯ И РЕЖИМ ПОКАЗА ВКЛЮЧЕН - ДОБАВЛЯЕМ СПЕЦИАЛЬНУЮ МАРКИРОВКУ
        if (isForbidden && this.showForbiddenCells) {
            ctx.strokeStyle = 'rgba(128, 0, 128, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Добавляем символ "X" для запрещенных клеток
            ctx.strokeStyle = 'rgba(128, 0, 128, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - hexSize * 0.4, y - hexSize * 0.4);
            ctx.lineTo(x + hexSize * 0.4, y + hexSize * 0.4);
            ctx.moveTo(x + hexSize * 0.4, y - hexSize * 0.4);
            ctx.lineTo(x - hexSize * 0.4, y + hexSize * 0.4);
            ctx.stroke();
        }
        
        // Рисуем крестик для попаданий и потопленных кораблей
        if (state === 'hit' || state === 'sunk') {
            // Для потопленных кораблей используем черный крестик, для обычных попаданий - белый
            ctx.strokeStyle = state === 'sunk' ? '#000000' : '#FFFFFF';
            ctx.lineWidth = state === 'sunk' ? 3 : 2; // Более толстый крестик для потопленных кораблей
            
            ctx.beginPath();
            ctx.moveTo(x - hexSize * 0.3, y - hexSize * 0.3);
            ctx.lineTo(x + hexSize * 0.3, y + hexSize * 0.3);
            ctx.moveTo(x + hexSize * 0.3, y - hexSize * 0.3);
            ctx.lineTo(x - hexSize * 0.3, y + hexSize * 0.3);
            ctx.stroke();
        }
        
        if (state === 'miss') {
            ctx.fillStyle = '#2196F3';
            ctx.beginPath();
            ctx.arc(x, y, hexSize * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // ОНЛАЙН-ФУНКЦИОНАЛЬНОСТЬ
    createOnlineGame() {
        this.isOnline = true;
        this.isHost = true;
        
        this.peer = new Peer({
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            pingInterval: 5000
        });
        
        this.peer.on('open', (id) => {
            this.roomId = id;
            this.updateConnectionStatus(`Комната создана! ID: ${id}`, 'success');
            document.getElementById('roomInfo').innerHTML = `ID комнаты: <strong>${id}</strong><br>Ожидаем подключения...`;
            document.getElementById('roomInfo').style.display = 'block';
        });
        
        this.peer.on('connection', (conn) => {
            this.connection = conn;
            this.setupConnection();
            this.updateConnectionStatus('Игрок подключен!', 'success');
        });
        
        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            this.updateConnectionStatus('Ошибка подключения: ' + err.type, 'error');
        });
    }
    
    joinOnlineGame() {
        const roomId = document.getElementById('roomIdInput').value.trim();
        if (!roomId) {
            alert('Введите ID комнаты');
            return;
        }
        
        this.isOnline = true;
        this.isHost = false;
        
        this.peer = new Peer({
            host: '0.peerjs.com',
            port: 443,
            path: '/',
            pingInterval: 5000
        });
        
        this.peer.on('open', (id) => {
            this.roomId = roomId;
            this.connection = this.peer.connect(roomId);
            this.setupConnection();
            this.updateConnectionStatus('Подключаемся к комнате...', 'info');
        });
        
        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            this.updateConnectionStatus('Ошибка подключения: ' + err.type, 'error');
        });
    }
    
    setupConnection() {
        this.connection.on('open', () => {
            this.updateConnectionStatus('Подключено!', 'success');
            this.updateSyncControls({ visible: true, enabled: true });
            this.updateSyncStatus('Соединение установлено. Можно синхронизировать.', 'success');
            if (!this.isHost) {
                this.sendData({ type: 'request_state', reason: 'initial_sync', timestamp: Date.now() });
            }
        });
        
        this.connection.on('data', (data) => {
            this.handleOnlineData(data);
        });
        
        this.connection.on('close', () => {
            this.updateConnectionStatus('Соединение разорвано', 'error');
            this.updateSyncControls({ visible: true, enabled: false });
            this.updateSyncStatus('Соединение разорвано.', 'error', { autoHide: false });
            this.leaveOnlineGame({ preserveStatus: true });
        });
        
        this.connection.on('error', (err) => {
            console.error('Connection error:', err);
            this.updateConnectionStatus('Ошибка соединения', 'error');
            this.updateSyncControls({ visible: true, enabled: false });
            this.updateSyncStatus('Ошибка соединения. Попробуйте переподключиться.', 'error', { autoHide: false });
        });
    }
    
    handleOnlineData(data) {
        console.log("Получены данные:", data);
        
        switch (data.type) {
            case 'ready':
                this.opponentShips = Array.isArray(data.ships) ? data.ships : [];
                this.drawBoards();
                this.updateScores();
                this.updateSyncControls({ visible: true, enabled: true });

                if (this.isHost) {
                    this.updateSyncStatus('Противник готов. Отправляем свои данные.', 'success');
                    this.sendData(this.buildGameStatePayload('ready_ack'));
                } else {
                    this.updateSyncStatus('Противник подтвердил готовность.', 'success');
                }
                break;
                
            case 'game_state':
                if (Array.isArray(data.ships)) {
                    this.opponentShips = data.ships;
                }
                if (data.gamePhase) {
                    this.gamePhase = data.gamePhase;
                    this.updateGamePhase();
                }
                if (data.activeRole) {
                    this.currentPlayer = this.mapRoleToPerspective(data.activeRole);
                }
                this.updateSyncControls({ visible: true, enabled: true });
                this.drawBoards();
                this.updateScores();

                if (data.reason === 'sync_response' || data.reason === 'sync_push') {
                    this.updateSyncStatus('Синхронизация завершена.', 'success');
                } else if (data.reason === 'ready_ack') {
                    this.updateSyncStatus('Противник получил вашу расстановку.', 'success');
                } else {
                    this.updateSyncStatus('Данные противника обновлены.', 'info');
                }
                break;
                
            case 'start_battle':
                this.startBattle({ fromNetwork: true, activeRole: data.activeRole });
                break;
                
            case 'shot':
                if (data.nextRole) {
                    this.currentPlayer = this.mapRoleToPerspective(data.nextRole);
                    this.updateGamePhase();
                }
                this.receiveShot(data.row, data.col, data.nextRole);
                break;
                
            case 'shot_result':
                this.opponentBoard[data.row][data.col] = data.hit ? 'hit' : 'miss';
                
                if (data.sunkShip) {
                    this.opponentShips.forEach(ship => {
                        if (ship.typeIndex === data.sunkShip.typeIndex && 
                            ship.instance === data.sunkShip.instance) {
                            ship.hits = data.sunkShip.hits;
                        }
                    });
                    
                    // ПОМЕЧАЕМ ЗАПРЕЩЕННЫЕ КЛЕТКИ ДЛЯ ИГРОКА
                    this.markPlayerForbiddenCellsAroundShip(data.sunkShip);
                }
                
                this.drawBoards();
                this.updateScores();
                
                if (data.nextRole) {
                    this.currentPlayer = this.mapRoleToPerspective(data.nextRole);
                } else if (!data.hit) {
                    this.currentPlayer = 'me';
                }
                this.updateGamePhase();
                break;
                
            case 'request_state':
                this.updateSyncStatus('Получен запрос синхронизации. Отправляем актуальные данные...', 'info');
                this.sendData(this.buildGameStatePayload('sync_response'));
                break;
        }
    }
    
    sendData(data) {
        if (this.connection && this.connection.open) {
            this.connection.send(data);
            return true;
        } else {
            console.warn("Соединение не открыто, данные не отправлены");
            this.updateConnectionStatus("Ошибка: нет соединения", "error");
            return false;
        }
    }
    
    updateConnectionStatus(message, type) {
        const statusElement = document.getElementById('connectionStatus');
        statusElement.textContent = message;
        statusElement.style.display = 'block';
        statusElement.style.background = type === 'success' ? 'rgba(212, 237, 218, 0.2)' : 
                                       type === 'error' ? 'rgba(248, 215, 218, 0.2)' : 'rgba(209, 236, 241, 0.2)';
        statusElement.style.color = type === 'success' ? '#d4edda' : 
                                   type === 'error' ? '#f8d7da' : '#d1ecf1';
    }
    
    leaveOnlineGame({ preserveStatus = false } = {}) {
        if (this.connection) {
            this.connection.close();
        }
        if (this.peer) {
            this.peer.destroy();
        }
        this.isOnline = false;
        if (preserveStatus) {
            this.updateSyncControls({ visible: true, enabled: false });
        } else {
            this.updateSyncControls({ visible: false, enabled: false });
        }
        if (!preserveStatus) {
            this.updateSyncStatus();
        }
        this.initializeGame();
    }
}

// Глобальные функции для кнопок HTML
function createOnlineGame() {
    const game = document.querySelector('script')._gameInstance;
    if (game) {
        game.createOnlineGame();
    }
}

function joinOnlineGame() {
    const game = document.querySelector('script')._gameInstance;
    if (game) {
        game.joinOnlineGame();
    }
}

// Инициализация игры
document.addEventListener('DOMContentLoaded', () => {
    const game = new HexagonalBattleship();
    document.querySelector('script')._gameInstance = game;
});