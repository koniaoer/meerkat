.PHONY: dev dev-back dev-front test test-back lint clean help

# 默认目标
help:
	@echo "Meerkat - Prometheus Alert Analysis System"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  dev          启动前后端开发服务"
	@echo "  dev-back     仅启动后端"
	@echo "  dev-front    仅启动前端"
	@echo "  test         运行所有测试"
	@echo "  test-back    仅运行后端测试"
	@echo "  lint         代码检查"
	@echo "  clean        清理生成文件"
	@echo "  install      安装依赖"
	@echo "  docker-up    Docker 启动"
	@echo "  docker-down  Docker 停止"

# 安装依赖
install:
	cd backend && uv venv .venv --python 3.11 && . .venv/bin/activate && uv pip install -r requirements.txt pytest pytest-asyncio pytest-mock httpx
	cd frontend && npm install

# 开发服务
dev: dev-back

dev-back:
	cd backend && . .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

dev-front:
	cd frontend && npm run dev

# 测试
test: test-back

test-back:
	cd backend && . .venv/bin/activate && python -m pytest tests/ -v

# 代码检查
lint:
	cd backend && . .venv/bin/activate && python -m flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics || true

# 清理
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf backend/.venv frontend/node_modules

# Docker
docker-up:
	docker-compose up -d --build

docker-down:
	docker-compose down
