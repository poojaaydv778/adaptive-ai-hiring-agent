from typing import Literal
from pydantic import BaseModel, Field

class AnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=10000)

class HumanDecisionRequest(BaseModel):
    decision: Literal["hired", "not_hired"]
