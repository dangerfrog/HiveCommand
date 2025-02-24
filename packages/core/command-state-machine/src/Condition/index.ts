import { TransitionCondition } from "../types/TransitionCondition";

export class Condition {
    private condition: TransitionCondition;

    constructor(condition: TransitionCondition){
        this.condition = condition
    }

    get input_id(){
        return this.condition.input
    }

    get input_key(){
        return this.condition.inputKey
    }

    get value_id(){
        return this.condition.value
    }

    check(input: any, value: any){
        //console.log(input, value)
        try{
            let val = parseFloat(input)
            if(!isNaN(val)){
                input = val;
            }else{
                input = `${input}`
            }
            // console.log(input)
        }catch(e){
            input = `${input}`
        }

        try{
            let val = parseFloat(value)
            if(!isNaN(val)){
                value = val;
            }else{
                value = `${value}`
            }
            // console.log(value)
        }catch(e){
            value = `${value}`
        }

        // console.log("Checked", this.condition.comparator, "input", input, "value", value)
        
        // console.log("Type", typeof(input), typeof(value))
        switch(this.condition.comparator){
            case '>':
                return input > value;
            case '>=':
                return input >= value;
            case '<':
                return input < value
            case '<=':
                return input <= value;
            case '==':
                return input == value;
            case '!=':
                return input != value;
            default:
                break;
        }        
    }
}