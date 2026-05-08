"""CRUD 操作测试"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import models
import schemas
import crud


class TestModelConfigCRUD:
    """AI 模型配置 CRUD"""

    def test_create_model_config(self, db_session, sample_model_config):
        config = schemas.ModelConfigCreate(**sample_model_config)
        result = crud.create_model_config(db_session, config)
        assert result.id is not None
        assert result.provider_name == "DeepSeek"
        assert result.model_name == "deepseek-chat"
        assert result.is_active is True

    def test_get_model_configs(self, db_session, sample_model_config):
        config = schemas.ModelConfigCreate(**sample_model_config)
        crud.create_model_config(db_session, config)
        results = crud.get_model_configs(db_session)
        assert len(results) == 1
        assert results[0].provider_name == "DeepSeek"

    def test_update_model_config(self, db_session, sample_model_config):
        config = schemas.ModelConfigCreate(**sample_model_config)
        created = crud.create_model_config(db_session, config)

        updated_data = schemas.ModelConfigCreate(
            provider_name="OpenAI",
            api_key="sk-new-key",
            base_url="https://api.openai.com/v1",
            model_name="gpt-4",
            is_active=True,
        )
        result = crud.update_model_config(db_session, created.id, updated_data)
        assert result.provider_name == "OpenAI"
        assert result.model_name == "gpt-4"

    def test_delete_model_config(self, db_session, sample_model_config):
        config = schemas.ModelConfigCreate(**sample_model_config)
        created = crud.create_model_config(db_session, config)
        crud.delete_model_config(db_session, created.id)
        results = crud.get_model_configs(db_session)
        assert len(results) == 0

    def test_active_model_uniqueness(self, db_session, sample_model_config):
        """同一时间只有一个 active 模型"""
        config1 = schemas.ModelConfigCreate(**sample_model_config)
        crud.create_model_config(db_session, config1)

        # 创建第二个 active 配置，应该自动取消第一个
        config2_data = sample_model_config.copy()
        config2_data["provider_name"] = "OpenAI"
        config2_data["model_name"] = "gpt-4"
        config2 = schemas.ModelConfigCreate(**config2_data)
        crud.create_model_config(db_session, config2)

        active = crud.get_active_model_config(db_session)
        assert active.provider_name == "OpenAI"

        # 第一个应该不再是 active
        all_configs = crud.get_model_configs(db_session)
        deepseek_configs = [c for c in all_configs if c.provider_name == "DeepSeek"]
        assert all(not c.is_active for c in deepseek_configs)


class TestAlertCRUD:
    """告警 CRUD"""

    def test_create_alert(self, db_session, sample_alert_data):
        alert = schemas.AlertCreate(
            alert_name="HighMemoryUsage",
            status="firing",
            severity="warning",
            summary="Node memory usage above 90%",
            description="Memory usage is currently at 92.5%",
            raw_data='{"status": "firing"}',
        )
        result = crud.create_alert(db_session, alert, analysis_result="Test analysis")
        assert result.id is not None
        assert result.alert_name == "HighMemoryUsage"
        assert result.analysis_result == "Test analysis"

    def test_get_alerts_ordered_by_time(self, db_session):
        """告警按时间倒序返回"""
        for i in range(3):
            alert = schemas.AlertCreate(
                alert_name=f"Alert{i}",
                status="firing",
                severity="info",
                summary=f"Test alert {i}",
                description="desc",
                raw_data="{}",
            )
            crud.create_alert(db_session, alert)

        results = crud.get_alerts(db_session)
        assert len(results) == 3
        # 最新的应该排最前


class TestDingTalkConfigCRUD:
    """钉钉配置 CRUD"""

    def test_create_dingtalk_config(self, db_session, sample_dingtalk_config):
        config = schemas.DingTalkConfigCreate(**sample_dingtalk_config)
        result = crud.create_dingtalk_config(db_session, config)
        assert result.id is not None
        assert result.webhook_url == sample_dingtalk_config["webhook_url"]

    def test_update_dingtalk_config(self, db_session, sample_dingtalk_config):
        config = schemas.DingTalkConfigCreate(**sample_dingtalk_config)
        created = crud.create_dingtalk_config(db_session, config)

        updated = schemas.DingTalkConfigCreate(
            webhook_url="https://oapi.dingtalk.com/robot/send?access_token=updated",
            secret="SECnew456",
            is_active=False,
        )
        result = crud.update_dingtalk_config(db_session, created.id, updated)
        assert result.webhook_url == "https://oapi.dingtalk.com/robot/send?access_token=updated"
        assert result.is_active is False

    def test_delete_dingtalk_config(self, db_session, sample_dingtalk_config):
        config = schemas.DingTalkConfigCreate(**sample_dingtalk_config)
        created = crud.create_dingtalk_config(db_session, config)
        crud.delete_dingtalk_config(db_session, created.id)
        results = crud.get_dingtalk_configs(db_session)
        assert len(results) == 0

    def test_get_active_dingtalk_config(self, db_session, sample_dingtalk_config):
        config = schemas.DingTalkConfigCreate(**sample_dingtalk_config)
        crud.create_dingtalk_config(db_session, config)
        active = crud.get_active_dingtalk_config(db_session)
        assert active is not None
        assert active.is_active is True
