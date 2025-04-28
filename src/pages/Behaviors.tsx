import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import BehaviorList from "@/components/behaviors/BehaviorList";
import BehaviorForm from "@/components/behaviors/BehaviorForm";
import { ArrowLeft, Brain } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
export default function BehaviorsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAuthenticated,
    loading,
    user
  } = useAuth();
  useEffect(() => {
    console.log("Behaviors page mounted, path:", location.pathname);
    console.log("Auth state on Behaviors page:", {
      isAuthenticated,
      loading,
      userRole: user?.role
    });
    const checkAuth = async () => {
      // Verificar autenticación
      if (!isAuthenticated && !loading) {
        console.log("Not authenticated, redirecting to login");
        toast.error("Sesión expirada", {
          description: "Por favor inicia sesión para continuar"
        });
        navigate("/login", {
          replace: true
        });
        return false;
      }

      // Temporalmente permitir acceso a todos los roles hasta que se implemente correctamente
      // el sistema de roles y permisos
      setIsLoading(false);
      return true;
    };
    const timer = setTimeout(() => {
      checkAuth();
    }, 500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, loading, navigate, user, location]);
  if (loading || isLoading) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>;
  }
  return <div className="min-h-screen flex flex-col">
      <Navbar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex flex-1">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />
        <main className="flex-1 p-4 md:p-6 ml-0 md:ml-64 transition-all duration-300">
          <Routes>
            <Route path="/" element={<>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight">Comportamientos</h2>
                      <p className="text-muted-foreground">Crea y gestiona comportamientos para que la los evalué por ti</p>
                    </div>
                    <Button onClick={() => navigate("/behaviors/new")} className="mt-4 md:mt-0">
                      <Brain className="mr-2 h-4 w-4" /> Nuevo Comportamiento
                    </Button>
                  </div>
                  <BehaviorList />
                </>} />
            <Route path="/new" element={<>
                  <div className="flex items-center mb-6">
                    <Button variant="ghost" size="sm" onClick={() => navigate("/behaviors")} className="mr-4">
                      <ArrowLeft className="h-4 w-4 mr-2" /> Volver
                    </Button>
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight">Nuevo Comportamiento</h2>
                      <p className="text-muted-foreground">
                        Crear un nuevo comportamiento de análisis de IA
                      </p>
                    </div>
                  </div>
                  <BehaviorForm />
                </>} />
            <Route path="/edit/:id" element={<>
                  <div className="flex items-center mb-6">
                    <Button variant="ghost" size="sm" onClick={() => navigate("/behaviors")} className="mr-4">
                      <ArrowLeft className="h-4 w-4 mr-2" /> Volver
                    </Button>
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight">Editar Comportamiento</h2>
                      <p className="text-muted-foreground">
                        Modificar comportamiento de análisis de IA
                      </p>
                    </div>
                  </div>
                  <BehaviorForm />
                </>} />
          </Routes>
        </main>
      </div>
      <div className="ml-0 md:ml-64 transition-all duration-300">
        <Footer />
      </div>
    </div>;
}