from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import json

import models, schemas, crud, ai_service, dingtalk_service
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Meerkat AI Bot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

# Model Config Endpoints
@app.post("/api/v1/model-configs", response_model=schemas.ModelConfig)
def create_config(config: schemas.ModelConfigCreate, db: Session = Depends(get_db)):
    return crud.create_model_config(db=db, config=config)

@app.get("/api/v1/model-configs", response_model=List[schemas.ModelConfig])
def read_configs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_model_configs(db, skip=skip, limit=limit)

@app.get("/api/v1/model-configs/active", response_model=schemas.ModelConfig)
def read_active_config(db: Session = Depends(get_db)):
    config = crud.get_active_model_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="No active config found")
    return config

@app.put("/api/v1/model-configs/{config_id}", response_model=schemas.ModelConfig)
def update_config(config_id: int, config: schemas.ModelConfigCreate, db: Session = Depends(get_db)):
    db_config = crud.update_model_config(db, config_id, config)
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
    return db_config

@app.delete("/api/v1/model-configs/{config_id}")
def delete_config(config_id: int, db: Session = Depends(get_db)):
    crud.delete_model_config(db, config_id)
    return {"message": "Deleted successfully"}

# DingTalk Config Endpoints
@app.get("/api/v1/dingtalk-configs", response_model=List[schemas.DingTalkConfig])
def read_dingtalk_configs(db: Session = Depends(get_db)):
    return crud.get_dingtalk_configs(db)

@app.post("/api/v1/dingtalk-configs", response_model=schemas.DingTalkConfig)
def create_dingtalk_config(config: schemas.DingTalkConfigCreate, db: Session = Depends(get_db)):
    return crud.create_dingtalk_config(db, config)

@app.put("/api/v1/dingtalk-configs/{config_id}", response_model=schemas.DingTalkConfig)
def update_dingtalk_config(config_id: int, config: schemas.DingTalkConfigCreate, db: Session = Depends(get_db)):
    return crud.update_dingtalk_config(db, config_id, config)

@app.delete("/api/v1/dingtalk-configs/{config_id}")
def delete_dingtalk_config(config_id: int, db: Session = Depends(get_db)):
    crud.delete_dingtalk_config(db, config_id)
    return {"message": "Deleted successfully"}

@app.post("/api/v1/dingtalk-configs/test")
async def test_dingtalk_config(config: schemas.DingTalkConfigCreate):
    # Create a temporary config object for testing
    temp_config = models.DingTalkConfig(**config.model_dump())
    test_alert = {
        "labels": {"alertname": "TestAlert", "severity": "info"},
        "status": "firing",
        "annotations": {"summary": "This is a test notification from Meerkat."}
    }
    test_analysis = "Test AI analysis content."
    
    try:
        await dingtalk_service.send_dingtalk_notification(test_alert, test_analysis, temp_config)
        return {"status": "success", "message": "Test message sent to DingTalk"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"DingTalk test failed: {str(e)}")

@app.post("/api/v1/model-configs/test")
async def test_model_config(config: schemas.ModelConfigCreate):
    # Create a temporary model config object for testing
    temp_config = models.ModelConfig(**config.model_dump())
    result = await ai_service.analyze_alert_with_ai({"test": "connection"}, temp_config)
    
    if "AI Analysis failed" in result:
        raise HTTPException(status_code=400, detail=result)
    
    return {"status": "success", "message": "Connection successful", "response": result}

# Alert Endpoints
@app.post("/api/v1/alerts")
async def receive_alert(webhook_data: schemas.PrometheusWebhook, db: Session = Depends(get_db)):
    active_config = crud.get_active_model_config(db)
    dingtalk_config = crud.get_active_dingtalk_config(db)
    
    results = []
    for alert in webhook_data.alerts:
        # 1. Prepare alert record
        alert_create = schemas.AlertCreate(
            alert_name=alert.labels.get("alertname", "Unknown"),
            status=alert.status,
            severity=alert.labels.get("severity", "info"),
            summary=alert.annotations.get("summary", "No summary"),
            description=alert.annotations.get("description", "No description"),
            raw_data=json.dumps(alert.model_dump())
        )
        
        # 2. Call AI for analysis
        analysis = await ai_service.analyze_alert_with_ai(alert.model_dump(), active_config)
        
        # 3. Save to DB
        db_alert = crud.create_alert(db, alert_create, analysis_result=analysis)
        results.append(db_alert)
        
        # 4. Send to DingTalk if active
        if dingtalk_config:
            await dingtalk_service.send_dingtalk_notification(alert.model_dump(), analysis, dingtalk_config)
        
    return {"status": "success", "processed": len(results)}

@app.get("/api/v1/alerts", response_model=List[schemas.Alert])
def get_alerts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_alerts(db, skip=skip, limit=limit)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
