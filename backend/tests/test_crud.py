"""CRUD 操作测试"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import models
import schemas
import crud
from tests.conftest import TestSessionLocal, test_engine
from database import Base


@pytest.fixture(autouse=True)
def clean_tables():
    """每个CRUD测试前清空所有表数据"""
    with test_engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        conn.commit()
    yield


class TestModelConfigCRUD:
    """AI 模型配置 CRUD"""

    def test_create_model_config(self, sample_model_config):
        db = TestSessionLocal()
        try:
            config = schemas.ModelConfigCreate(**sample_model_config)
            result = crud.create_model_config(db, config)
            assert result.id is not None
            assert result.provider_name == "DeepSeek"
            assert result.model_name == "deepseek-chat"
            assert result.is_active is True
        finally:
            db.close()

    def test_get_model_configs(self, sample_model_config):
        db = TestSessionLocal()
        try:
            config = schemas.ModelConfigCreate(**sample_model_config)
            crud.create_model_config(db, config)
            results = crud.get_model_configs(db)
            assert len(results) == 1
            assert results[0].provider_name == "DeepSeek"
        finally:
            db.close()

    def test_update_model_config(self, sample_model_config):
        db = TestSessionLocal()
        try:
            config = schemas.ModelConfigCreate(**sample_model_config)
            created = crud.create_model_config(db, config)
            updated_data = schemas.ModelConfigCreate(
                provider_name="OpenAI",
                api_key="sk-new-key",
                base_url="https://api.openai.com/v1",
                model_name="gpt-4",
                is_active=True,
            )
            result = crud.update_model_config(db, created.id, updated_data)
            assert result.provider_name == "OpenAI"
            assert result.model_name == "gpt-4"
        finally:
            db.close()

    def test_delete_model_config(self, sample_model_config):
        db = TestSessionLocal()
        try:
            config = schemas.ModelConfigCreate(**sample_model_config)
            created = crud.create_model_config(db, config)
            crud.delete_model_config(db, created.id)
            results = crud.get_model_configs(db)
            assert len(results) == 0
        finally:
            db.close()

    def test_active_model_uniqueness(self, sample_model_config):
        """同一时间只有一个 active 模型"""
        db = TestSessionLocal()
        try:
            config1 = schemas.ModelConfigCreate(**sample_model_config)
            crud.create_model_config(db, config1)

            config2_data = sample_model_config.copy()
            config2_data["provider_name"] = "OpenAI"
            config2_data["model_name"] = "gpt-4"
            config2 = schemas.ModelConfigCreate(**config2_data)
            crud.create_model_config(db, config2)

            active = crud.get_active_model_config(db)
            assert active.provider_name == "OpenAI"

            all_configs = crud.get_model_configs(db)
            deepseek_configs = [c for c in all_configs if c.provider_name == "DeepSeek"]
            assert all(not c.is_active for c in deepseek_configs)
        finally:
            db.close()


class TestAlertCRUD:
    """告警 CRUD"""

    def test_create_alert(self, sample_alert_data):
        db = TestSessionLocal()
        try:
            alert = schemas.AlertCreate(
                alert_name="HighMemoryUsage",
                status="firing",
                severity="warning",
                summary="Node memory usage above 90%",
                description="Memory usage is currently at 92.5%",
                raw_data='{"status": "firing"}',
            )
            result = crud.create_alert(db, alert, analysis_result="Test analysis")
            assert result.id is not None
            assert result.alert_name == "HighMemoryUsage"
            assert result.analysis_result == "Test analysis"
        finally:
            db.close()

    def test_get_alerts_ordered_by_time(self):
        """告警按时间倒序返回"""
        db = TestSessionLocal()
        try:
            for i in range(3):
                alert = schemas.AlertCreate(
                    alert_name=f"Alert{i}",
                    status="firing",
                    severity="info",
                    summary=f"Test alert {i}",
                    description="desc",
                    raw_data="{}",
                )
                crud.create_alert(db, alert)
            results = crud.get_alerts(db)
            assert len(results) == 3
        finally:
            db.close()


class TestDingTalkConfigCRUD:
    """钉钉配置 CRUD"""

    def test_create_dingtalk_config(self, sample_dingtalk_config):
        db = TestSessionLocal()
        try:
            config = schemas.DingTalkConfigCreate(**sample_dingtalk_config)
            result = crud.create_dingtalk_config(db, config)
            assert result.id is not None
            assert result.webhook_url == sample_dingtalk_config["webhook_url"]
        finally:
            db.close()

    def test_update_dingtalk_config(self, sample_dingtalk_config):
        db = TestSessionLocal()
        try:
            config = schemas.DingTalkConfigCreate(**sample_dingtalk_config)
            created = crud.create_dingtalk_config(db, config)
            updated = schemas.DingTalkConfigCreate(
                webhook_url="https://oapi.dingtalk.com/robot/send?access_token=***2",
                secret="SECnew456",
                is_active=False,
            )
            result = crud.update_dingtalk_config(db, created.id, updated)
            assert result.webhook_url == "https://oapi.dingtalk.com/robot/send?access_token=***2"
            assert result.is_active is False
        finally:
            db.close()

    def test_delete_dingtalk_config(self, sample_dingtalk_config):
        db = TestSessionLocal()
        try:
            config = schemas.DingTalkConfigCreate(**sample_dingtalk_config)
            created = crud.create_dingtalk_config(db, config)
            crud.delete_dingtalk_config(db, created.id)
            results = crud.get_dingtalk_configs(db)
            assert len(results) == 0
        finally:
            db.close()

    def test_get_active_dingtalk_config(self, sample_dingtalk_config):
        db = TestSessionLocal()
        try:
            config = schemas.DingTalkConfigCreate(**sample_dingtalk_config)
            crud.create_dingtalk_config(db, config)
            active = crud.get_active_dingtalk_config(db)
            assert active is not None
            assert active.is_active is True
        finally:
            db.close()
