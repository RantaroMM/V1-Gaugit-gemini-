import useBLE from "@/hooks/use-ble";
import { createContext, useContext } from "react";

type BLEContextType = ReturnType<typeof useBLE>; //O tipo BLEContextType será exatamente o tipo que o useBLE retorna

const BLEContext = createContext<BLEContextType | undefined>(undefined); //Declara o que a variável pode retornar

export function BLEProvider({ children }: {children: React.ReactNode }){ /*A função recebe uma propriedade chamada children,
                                                                        e ela pode ser qualquer coisa renderizável pelo React*/
    
    const ble = useBLE(); //chama o useBLE uma única vez e se torna um objeto com tudo que o hook retorna
    
    return ( //pega o valor de ble (tudo o que o hook retornou) e distribui para todas as telas filhas
        <BLEContext.Provider value={ble}> 
            {children}
        </BLEContext.Provider>
    );
}

export function useBLEContext() {
    const context = useContext(BLEContext);
    
    if(!context) { //se context não retornar nada, é porque não foi usado dentro do Provider
        throw new Error("useBLEContext deve ser usado dentro de BLEProvider");
    }

    return context;
}