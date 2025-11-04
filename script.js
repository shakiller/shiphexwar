class HexagonalBattleship {
    constructor() {
        this.myBoardCanvas = document.getElementById('myBoard');
        this.opponentBoardCanvas = document.getElementById('opponentBoard');
        this.myCtx = this.myBoardCanvas.getContext('2d');
        this.opponentCtx = this.opponentBoardCanvas.getContext('2d');
        
        // Устанавливаем внутренние размеры canvas равными CSS размерам
        this.setCanvasSize(this.myBoardCanvas, 500, 500);
        this.setCanvasSize(this.opponentBoardCanvas, 500, 500);
        
        // Переменные для отслеживания мыши
        this.currentMouseX = 0;
        this.currentMouseY = 0;
        this.lastHoveredHex = null;
        
        // Переменные для подсветки последнего клика
        this.lastClickedHexMyBoard = null;
        this.lastClickedHexOpponentBoard = null;
        
        // Отображение зон клика
        this.showTouchZones = false;
        
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
        
        this.initializeGame();
        this.setupEventListeners();
        this.createShipPalette();
        this.drawBoards();
    }
    
    // Устанавливаем размеры canvas с учетом devicePixelRatio
    setCanvasSize(canvas, width, height) {
        const dpr = window.devicePixelRatio || 1;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
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
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' || e.key === 'к' || e.key === 'R' || e.key === 'Й') {
                this.rotateRight();
            }
            if (e.key === 'q' || e.key === 'й' || e.key === 'Q' || e.key === 'Й') {
                this.rotateLeft();
            }
        });

        window.addEventListener('resize', () => {
            this.drawBoards();
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
                        
                        if (this.isOnline && this.isHost) {
                            this.sendData({
                                type: 'ready',
                                ships: this.myShips
                            });
                        }
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
    
    getTestLine(startRow, startCol, directions) {
        const cells = [{ row: startRow, col: startCol }];
        
        // Проходим в обоих направлениях для каждой пары
        directions.forEach(dir => {
            let currentRow = startRow;
            let currentCol = startCol;
            let step = 0;
            
            while (true) {
                const nextPos = this.getNextHexInDirection(currentRow, currentCol, dir, step);
                if (!nextPos || !this.isValidPosition(nextPos.row, nextPos.col)) break;
                
                // Проверяем, не добавили ли мы уже эту клетку
                const alreadyExists = cells.some(cell => 
                    cell.row === nextPos.row && cell.col === nextPos.col
                );
                
                if (!alreadyExists) {
                    cells.push({ row: nextPos.row, col: nextPos.col });
                }
                
                currentRow = nextPos.row;
                currentCol = nextPos.col;
                step++;
            }
        });
        
        return cells;
    }
    
    getNextHexInDirection(row, col, direction, step) {
        // ПРАВИЛЬНЫЕ направления для гексагональной сетки
        const directions = [
            // 0: Вертикаль вниз (↓)
            () => ({ row: row + 1, col: col }),
            
            // 1: Диагональ 1 (↘) - ПРАВИЛЬНО: (5,0)(4,1)(4,2)(3,3)(3,4)(2,5)(2,6)(1,7)
            () => {
                if (step % 2 === 0) {
                    // Четные шаги: вниз-вправо
                    return { row: row + 1, col: col + 1 };
                } else {
                    // Нечетные шаги: вниз-вправо
                    return { row: row + 1, col: col + 1 };
                }
            },
            
            // 2: Диагональ 2 (↙) - ПРАВИЛЬНО: (2,0)(2,1)(3,2)(3,3)(4,4)(4,5)(5,6)(5,7)
            () => {
                if (step % 2 === 0) {
                    // Четные шаги: вниз-влево
                    return { row: row + 1, col: col - 1 };
                } else {
                    // Нечетные шаги: вниз-влево
                    return { row: row + 1, col: col - 1 };
                }
            },
            
            // 3: Вертикаль вверх (↑)
            () => ({ row: row - 1, col: col }),
            
            // 4: Диагональ 1 противоположное (↖)
            () => {
                if (step % 2 === 0) {
                    // Четные шаги: вверх-влево
                    return { row: row - 1, col: col - 1 };
                } else {
                    // Нечетные шаги: вверх-влево
                    return { row: row - 1, col: col - 1 };
                }
            },
            
            // 5: Диагональ 2 противоположное (↗)
            () => {
                if (step % 2 === 0) {
                    // Четные шаги: вверх-вправо
                    return { row: row - 1, col: col + 1 };
                } else {
                    // Нечетные шаги: вверх-вправо
                    return { row: row - 1, col: col + 1 };
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
        header.innerHTML = `<strong>Центральная клетка: [${hex.row},${hex.col}]</strong>`;
        resultsDiv.appendChild(header);
        
        this.testLines.forEach((line, index) => {
            const lineDiv = document.createElement('div');
            lineDiv.className = `test-line line-${index}`;
            
            const cellsText = line.cells.map(cell => `[${cell.row},${cell.col}]`).join(' → ');
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
    
    // ПРАВИЛЬНЫЕ НАПРАВЛЕНИЯ ДЛЯ ГЕКСАГОНАЛЬНОЙ СЕТКИ
    getShipPositions(row, col, size, orientation) {
        const positions = [{ row, col }];
        let currentRow = row;
        let currentCol = col;
        
        // ПРАВИЛЬНЫЕ направления для гексагональной сетки
        const directions = [
            // 0: Вертикаль вниз (↓)
            () => ({ dr: 1, dc: 0 }),
            
            // 1: Диагональ 1 (↘) - ПРАВИЛЬНО: (5,0)(4,1)(4,2)(3,3)(3,4)(2,5)(2,6)(1,7)
            () => ({ dr: 1, dc: 1 }),
            
            // 2: Диагональ 2 (↙) - ПРАВИЛЬНО: (2,0)(2,1)(3,2)(3,3)(4,4)(4,5)(5,6)(5,7)
            () => ({ dr: 1, dc: -1 }),
            
            // 3: Вертикаль вверх (↑)
            () => ({ dr: -1, dc: 0 }),
            
            // 4: Диагональ 1 противоположное (↖)
            () => ({ dr: -1, dc: -1 }),
            
            // 5: Диагональ 2 противоположное (↗)
            () => ({ dr: -1, dc: 1 })
        ];
        
        const dirFunc = directions[orientation];
        
        for (let i = 1; i < size; i++) {
            const dir = dirFunc();
            
            currentRow += dir.dr;
            currentCol += dir.dc;
            
            if (!this.isValidPosition(currentRow, currentCol)) {
                return null;
            }
            
            positions.push({ row: currentRow, col: currentCol });
        }
        
        return positions;
    }
    
    isValidPosition(row, col) {
        return row >= 0 && row < this.boardSize && col >= 0 && col < this.boardSize;
    }
    
    // ПРАВИЛЬНАЯ ПРОВЕРКА СОСЕДНИХ КЛЕТОК ДЛЯ ГЕКСАГОНАЛЬНОЙ СЕТКИ
    getNeighborCells(row, col) {
        const neighbors = [];
        
        // 6 направлений для гексагональной сетки
        const directions = [
            { dr: 1, dc: 0 },   // Вниз
            { dr: 1, dc: 1 },   // Вниз-вправо
            { dr: 1, dc: -1 },  // Вниз-влево
            { dr: -1, dc: 0 },  // Вверх
            { dr: -1, dc: -1 }, // Вверх-влево
            { dr: -1, dc: 1 }   // Вверх-вправо
        ];
        
        for (const dir of directions) {
            const newRow = row + dir.dr;
            const newCol = col + dir.dc;
            
            if (this.isValidPosition(newRow, newCol)) {
                neighbors.push({ row: newRow, col: newCol });
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
        
        // Проверяем соседей для ВСЕХ клеток корабля
        const allNeighbors = new Set();
        
        // Собираем всех соседей всех клеток корабля
        for (const pos of positions) {
            const neighbors = this.getNeighborCells(pos.row, pos.col);
            for (const neighbor of neighbors) {
                const key = `${neighbor.row},${neighbor.col}`;
                allNeighbors.add(key);
            }
        }
        
        // Проверяем что среди соседей нет других кораблей
        for (const key of allNeighbors) {
            const [r, c] = key.split(',').map(Number);
            
            // Проверяем что эта клетка не является частью текущего корабля
            const isPartOfCurrentShip = positions.some(pos => 
                pos.row === r && pos.col === c
            );
            
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
        
        this.ships.forEach((shipType, typeIndex) => {
            for (let i = 0; i < shipType.count; i++) {
                let placed = false;
                let attempts = 0;
                
                while (!placed && attempts < 500) {
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
                }
            }
        });
        
        this.createShipPalette();
        this.drawBoards();
        this.updateScores();
        
        if (this.allShipsPlaced()) {
            document.getElementById('startGame').style.display = 'block';
            
            if (this.isOnline && this.isHost) {
                this.sendData({
                    type: 'ready',
                    ships: this.myShips
                });
            }
        }
    }
    
    allShipsPlaced() {
        let totalShips = 0;
        this.ships.forEach(shipType => {
            totalShips += shipType.count;
        });
        
        return this.myShips.length === totalShips;
    }
    
    startBattle() {
        if (!this.allShipsPlaced()) return;
        
        this.gamePhase = 'battle';
        this.currentPlayer = 'me';
        this.updateGamePhase();
        this.drawBoards();
        
        if (this.isOnline) {
            this.sendData({
                type: 'start_battle'
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
            this.sendData({
                type: 'shot',
                row: row,
                col: col,
                hit: hit,
                sunkShip: sunkShip
            });
            
            if (!hit) {
                this.currentPlayer = 'opponent';
                this.updateGamePhase();
            }
        } else {
            if (!hit) {
                this.currentPlayer = 'opponent';
                this.updateGamePhase();
                setTimeout(() => this.makeBotMove(), 800);
            }
        }
    }
    
    makeBotMove() {
        if (this.gamePhase !== 'battle' || this.currentPlayer !== 'opponent') return;
        
        let row, col;
        let attempts = 0;
        
        do {
            row = Math.floor(Math.random() * this.boardSize);
            col = Math.floor(Math.random() * this.boardSize);
            attempts++;
        } while (this.isAlreadyShot(row, col, this.opponentShots) && attempts < 100);
        
        if (attempts < 100) {
            this.receiveShot(row, col);
        }
    }
    
    receiveShot(row, col) {
        if (this.gamePhase !== 'battle') return;
        
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
            this.sendData({
                type: 'shot_result',
                row: row,
                col: col,
                hit: hit,
                sunkShip: sunkShip
            });
            
            if (!hit) {
                this.currentPlayer = 'me';
                this.updateGamePhase();
            }
        } else {
            if (!hit) {
                this.currentPlayer = 'me';
                this.updateGamePhase();
            }
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
                phaseElement.textContent = `Фаза боя - Ход: ${this.currentPlayer === 'me' ? 'Ваш' : 'Противника'}`;
                break;
            case 'gameover':
                phaseElement.textContent = 'Игра завершена';
                break;
        }
        
        document.getElementById('playerMe').classList.toggle('active', this.currentPlayer === 'me');
        document.getElementById('playerOpponent').classList.toggle('active', this.currentPlayer === 'opponent');
    }
    
    updateScores() {
        const myAliveShips = this.myShips.filter(ship => !ship.hits.every(h => h)).length;
        const opponentAliveShips = this.opponentShips.filter(ship => !ship.hits.every(h => h)).length;
        
        document.getElementById('scoreMe').textContent = `${myAliveShips} кораблей`;
        document.getElementById('scoreOpponent').textContent = `${opponentAliveShips} кораблей`;
    }
    
    drawBoards() {
        this.drawBoard(this.myCtx, this.myBoardCanvas, this.myBoard, this.myShips, true);
        this.drawBoard(this.opponentCtx, this.opponentBoardCanvas, this.opponentBoard, this.opponentShips, false);
    }
    
    drawBoard(ctx, canvas, board, ships, showShips) {
        // Получаем реальные размеры canvas (уже с учетом DPR)
        const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
        const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
        
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // ОТЛАДКА: информация о размерах
        if (this.showTouchZones) {
            ctx.fillStyle = 'red';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`Canvas: ${Math.floor(canvasWidth)}x${Math.floor(canvasHeight)}`, 10, 15);
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
                
                this.drawHex(ctx, center.x, center.y, center.hexSize, board[row][col], showShips, row, col, isLastClicked);
                
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
                    this.drawHex(ctx, center.x, center.y, center.hexSize, valid ? 'ship-preview' : 'invalid-preview', showShips, pos.row, pos.col, false);
                }
                ctx.globalAlpha = 1.0;
                
                // Отладочная информация
                if (this.showTouchZones) {
                    ctx.fillStyle = valid ? 'lime' : 'red';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(`Корабль: ${positions.length} из ${this.selectedShip.size} клеток`, 10, 30);
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
    
    drawHex(ctx, x, y, hexSize, state, showShips, row, col, isLastClicked) {
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
                    ctx.fillStyle = 'rgba(0, 0, 50, 0.7)';
                }
                break;
            case 'hit':
                ctx.fillStyle = '#FF5252';
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
        
        if (!isLastClicked) {
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
        
        if (state === 'hit') {
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2;
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
            if (!this.isHost) {
                this.sendData({ type: 'request_state' });
            }
        });
        
        this.connection.on('data', (data) => {
            this.handleOnlineData(data);
        });
        
        this.connection.on('close', () => {
            this.updateConnectionStatus('Соединение разорвано', 'error');
            this.leaveOnlineGame();
        });
        
        this.connection.on('error', (err) => {
            console.error('Connection error:', err);
            this.updateConnectionStatus('Ошибка соединения', 'error');
        });
    }
    
    handleOnlineData(data) {
        console.log("Получены данные:", data);
        
        switch (data.type) {
            case 'ready':
                if (this.isHost) {
                    this.opponentShips = data.ships;
                    this.sendData({
                        type: 'game_state',
                        ships: this.myShips,
                        gamePhase: this.gamePhase
                    });
                }
                break;
                
            case 'game_state':
                this.opponentShips = data.ships;
                this.gamePhase = data.gamePhase;
                this.updateGamePhase();
                this.drawBoards();
                break;
                
            case 'start_battle':
                this.startBattle();
                break;
                
            case 'shot':
                this.receiveShot(data.row, data.col);
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
                }
                
                this.drawBoards();
                this.updateScores();
                
                if (!data.hit) {
                    this.currentPlayer = 'me';
                    this.updateGamePhase();
                }
                break;
                
            case 'request_state':
                if (this.isHost) {
                    this.sendData({
                        type: 'game_state',
                        ships: this.myShips,
                        gamePhase: this.gamePhase
                    });
                }
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
    
    leaveOnlineGame() {
        if (this.connection) {
            this.connection.close();
        }
        if (this.peer) {
            this.peer.destroy();
        }
        this.isOnline = false;
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