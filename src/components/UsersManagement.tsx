import { useState } from 'react';
import { z } from 'zod';
import { useUsers } from '@/hooks/useUsers';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Loader2, Users, Eye, EyeOff, Shield } from 'lucide-react';
import type { AppRole } from '@/hooks/useAuth';

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().optional(),
  role: z.enum(['admin', 'user']),
});

export function UsersManagement() {
  const { users, isLoading, createUser, deleteUser } = useUsers();
  const { user: currentUser, isSuperAdmin, superAdminEmail } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'user' as AppRole,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleCreate = async () => {
    setErrors({});
    
    const result = createUserSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    try {
      await createUser.mutateAsync(formData);
      toast({ title: 'User created successfully' });
      setIsDialogOpen(false);
      setFormData({ email: '', password: '', fullName: '', role: 'user' });
    } catch (error: any) {
      toast({
        title: 'Failed to create user',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete ${email}?`)) return;

    try {
      await deleteUser.mutateAsync(userId);
      toast({ title: 'User deleted successfully' });
    } catch (error: any) {
      toast({
        title: 'Failed to delete user',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-medium">Users</CardTitle>
            <Badge variant="secondary" className="text-xs">{users.length}</Badge>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Input
                    placeholder="Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={errors.email ? 'border-destructive' : ''}
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
                
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      placeholder="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>
                
                <Input
                  placeholder="Full Name (optional)"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
                
                <Select
                  value={formData.role}
                  onValueChange={(value: AppRole) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>

                <Button 
                  className="w-full" 
                  onClick={handleCreate}
                  disabled={createUser.isPending}
                >
                  {createUser.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create User'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No users yet. Create your first user above.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-medium">Email</TableHead>
                  <TableHead className="text-xs font-medium">Name</TableHead>
                  <TableHead className="text-xs font-medium">Role</TableHead>
                  <TableHead className="text-xs font-medium w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isUserSuperAdmin = superAdminEmail && user.email === superAdminEmail;
                  const isAdmin = user.role === 'admin';
                  
                  // Super admin can delete anyone except themselves
                  // Regular admins can only delete non-admin users
                  const canDelete = isSuperAdmin 
                    ? user.id !== currentUser?.id 
                    : !isAdmin && !isUserSuperAdmin;

                  return (
                    <TableRow key={user.id} className="text-sm">
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-2">
                          {user.email}
                          {isUserSuperAdmin && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Shield className="h-3.5 w-3.5 text-amber-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Super Admin</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{user.full_name || '-'}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={isUserSuperAdmin ? 'default' : isAdmin ? 'default' : 'secondary'}
                          className={`text-xs ${isUserSuperAdmin ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                        >
                          {isUserSuperAdmin ? 'Super Admin' : user.role || 'user'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(user.id, user.email)}
                            disabled={deleteUser.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="h-7 w-7 flex items-center justify-center">
                                  <Shield className="h-3.5 w-3.5 text-muted-foreground/50" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{isUserSuperAdmin ? 'Super admin cannot be deleted' : 'Only super admin can delete admins'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
