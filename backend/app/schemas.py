from pydantic import BaseModel, Field


class GameConfig(BaseModel):
    num_bots: int = Field(default=3, ge=1, le=5)
    initial_stack: int = Field(default=1000, ge=20, le=100000)
    small_blind: int = Field(default=10, ge=1, le=1000)
    max_rounds: int = Field(default=50, ge=1, le=200)
    hero_name: str = Field(default="You", max_length=24)
    bot_think_ms: int = Field(default=1800, ge=0, le=10000)
